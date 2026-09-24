"""
DUET Architecture — Dual Clustering Enhanced Multivariate Time Series Forecasting
Based on KDD 2025: "DUET: Dual Clustering Enhanced Multivariate Time Series Forecasting"

Key Architecture Components:
1. Temporal Clustering Module (TCM): Routers and parallel pattern extractors capturing fine-grained temporal distributions and workload regimes.
2. Channel Clustering Module (CCM): Frequency-domain (RFFT) soft channel metric learning and sparsified channel interaction masking.
3. Fusion Module (FM): Masked cross-variable self-attention combining temporal cluster representations and channel masks into forecast heads.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F

from ml.bdh.config import FEATURE_COLUMNS, TARGET_COLUMNS


class TemporalClusteringModule(nn.Module):
    """
    Temporal Clustering Module (TCM):
    Identifies latent temporal workload distributions/regimes using a soft router and
    applies K_t cluster-specific linear pattern extractors.
    """

    def __init__(self, sequence_length: int = 60, hidden_dim: int = 64, num_clusters: int = 3, dropout: float = 0.05):
        super().__init__()
        self.sequence_length = sequence_length
        self.hidden_dim = hidden_dim
        self.num_clusters = num_clusters

        # Distribution router: maps average temporal summary of sequence -> num_clusters
        self.router = nn.Sequential(
            nn.Linear(sequence_length, hidden_dim // 2),
            nn.GELU(),
            nn.Linear(hidden_dim // 2, num_clusters),
        )

        # K_t parallel pattern extractors mapping T -> hidden_dim
        self.extractors = nn.ModuleList([
            nn.Sequential(
                nn.Linear(sequence_length, hidden_dim),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(hidden_dim, hidden_dim),
            )
            for _ in range(num_clusters)
        ])

    def forward(self, x_inverted: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Input x_inverted: [B, D, T]
        Returns:
            - cluster_feats: [B, D, hidden_dim]
            - routing_weights: [B, D, num_clusters]
        """
        B, D, T = x_inverted.shape

        # Compute routing logits per channel [B, D, num_clusters]
        logits = self.router(x_inverted)  # [B, D, K_t]
        routing_weights = F.softmax(logits, dim=-1)  # [B, D, K_t]

        # Extract features per cluster: list of [B, D, hidden_dim]
        cluster_outputs = []
        for extractor in self.extractors:
            feat = extractor(x_inverted)  # [B, D, hidden_dim]
            cluster_outputs.append(feat.unsqueeze(-1))  # [B, D, hidden_dim, 1]

        # Stack cluster outputs -> [B, D, hidden_dim, K_t]
        stacked = torch.cat(cluster_outputs, dim=-1)

        # Weighted combination across temporal clusters -> [B, D, hidden_dim]
        weights = routing_weights.unsqueeze(2)
        combined = torch.sum(stacked * weights, dim=-1)  # [B, D, hidden_dim]

        return combined, routing_weights


class ChannelClusteringModule(nn.Module):
    """
    Channel Clustering Module (CCM):
    Computes frequency-domain (RFFT) soft channel cluster assignments and learnable distance metrics,
    generating a dynamic sparsified channel correlation mask M_c [B, D, D].
    """

    def __init__(self, input_dim: int = 14, sequence_length: int = 60, num_clusters: int = 3, top_k: int = 6):
        super().__init__()
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.num_clusters = num_clusters
        self.top_k = min(top_k, input_dim)

        freq_len = sequence_length // 2 + 1
        # Frequency domain projector to latent channel space
        self.freq_proj = nn.Linear(freq_len, 32)

        # Learnable cluster centroids in frequency space
        self.cluster_centroids = nn.Parameter(torch.randn(num_clusters, 32))
        nn.init.normal_(self.cluster_centroids, std=0.02)

        # Channel interaction weights
        self.channel_metric = nn.Parameter(torch.eye(input_dim))

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """
        Input x: [B, T, D]
        Returns:
            - channel_mask: [B, D, D] sparsified soft channel correlation matrix
            - channel_cluster_weights: [B, D, num_clusters]
        """
        B, T, D = x.shape

        # 1. RFFT along temporal dimension: [B, T, D] -> [B, D, T] -> FFT -> [B, D, freq_len]
        x_perm = x.permute(0, 2, 1)  # [B, D, T]
        fft_vals = torch.fft.rfft(x_perm, dim=-1)  # [B, D, freq_len]
        fft_mag = torch.abs(fft_vals)  # [B, D, freq_len]

        # 2. Project frequency magnitude to latent channel space [B, D, 32]
        freq_emb = F.gelu(self.freq_proj(fft_mag))  # [B, D, 32]
        freq_norm = F.normalize(freq_emb, p=2, dim=-1)  # [B, D, 32]
        centroids_norm = F.normalize(self.cluster_centroids, p=2, dim=-1)  # [K_c, 32]

        # 3. Soft channel clustering: cosine similarity with centroids -> [B, D, K_c]
        sim_centroids = torch.einsum("b d f, k f -> b d k", freq_norm, centroids_norm)
        channel_cluster_weights = F.softmax(sim_centroids * 2.0, dim=-1)  # [B, D, K_c]

        # 4. Pairwise channel similarity matrix incorporating cluster centroids and channel metric: [B, D, D]
        cluster_rep = torch.matmul(channel_cluster_weights, centroids_norm)  # [B, D, 32]
        freq_cluster_emb = freq_norm + F.normalize(cluster_rep, p=2, dim=-1)
        freq_metric_emb = torch.einsum("c d, b d f -> b c f", self.channel_metric, freq_cluster_emb)
        channel_sim = torch.bmm(freq_metric_emb, freq_metric_emb.transpose(1, 2))  # [B, D, D]

        # 5. Top-K sparsification to retain significant inter-channel relationships
        if self.top_k < D:
            topk_vals, _ = torch.topk(channel_sim, k=self.top_k, dim=-1)
            min_topk = topk_vals[:, :, -1:].detach()  # threshold per channel
            mask = (channel_sim >= min_topk).float()
            sparsified_sim = channel_sim * mask
        else:
            sparsified_sim = channel_sim

        channel_mask = F.softmax(sparsified_sim * 2.0, dim=-1)  # [B, D, D]
        return channel_mask, channel_cluster_weights


class FusionModule(nn.Module):
    """
    Fusion Module (FM):
    Combines temporal cluster representations with dynamic channel interaction mask M_c
    using masked multi-head attention.
    """

    def __init__(self, hidden_dim: int = 64, nhead: int = 4, dropout: float = 0.05):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.nhead = nhead
        self.head_dim = hidden_dim // nhead

        self.q_proj = nn.Linear(hidden_dim, hidden_dim)
        self.k_proj = nn.Linear(hidden_dim, hidden_dim)
        self.v_proj = nn.Linear(hidden_dim, hidden_dim)
        self.out_proj = nn.Linear(hidden_dim, hidden_dim)

        self.norm1 = nn.LayerNorm(hidden_dim)
        self.norm2 = nn.LayerNorm(hidden_dim)
        self.ffn = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(hidden_dim * 2, hidden_dim),
        )
        self.dropout = nn.Dropout(dropout)

    def forward(self, h: torch.Tensor, channel_mask: torch.Tensor) -> torch.Tensor:
        """
        Input h: [B, D, hidden_dim]
        Input channel_mask: [B, D, D]
        Returns: [B, D, hidden_dim]
        """
        B, D, C = h.shape

        res = h
        h_norm = self.norm1(h)

        # Projections [B, D, C] -> [B, nhead, D, head_dim]
        q = self.q_proj(h_norm).view(B, D, self.nhead, self.head_dim).transpose(1, 2)
        k = self.k_proj(h_norm).view(B, D, self.nhead, self.head_dim).transpose(1, 2)
        v = self.v_proj(h_norm).view(B, D, self.nhead, self.head_dim).transpose(1, 2)

        # Scaled dot-product attention [B, nhead, D, D]
        scores = torch.matmul(q, k.transpose(-2, -1)) / math.sqrt(self.head_dim)

        # Modulate scores with channel_mask [B, 1, D, D]
        mask_exp = channel_mask.unsqueeze(1)
        scores = scores + torch.log(mask_exp + 1e-6)

        attn_weights = F.softmax(scores, dim=-1)
        attn_weights = self.dropout(attn_weights)

        # Weighted value aggregation: [B, nhead, D, head_dim] -> [B, D, C]
        attn_out = torch.matmul(attn_weights, v).transpose(1, 2).contiguous().view(B, D, C)
        attn_out = self.out_proj(attn_out)

        h = res + self.dropout(attn_out)

        # FFN
        h = h + self.dropout(self.ffn(self.norm2(h)))
        return h


class DUETModel(nn.Module):
    """
    DUET Model — Dual Clustering Enhanced Multivariate Time Series Model.
    """

    def __init__(
        self,
        input_dim: int = 14,
        sequence_length: int = 60,
        hidden_dim: int = 64,
        num_temporal_clusters: int = 3,
        num_channel_clusters: int = 3,
        nhead: int = 4,
        num_layers: int = 2,
        dropout: float = 0.05,
        output_targets: int = 3,
        output_horizons: int = 5,
        target_indices: list[int] | None = None,
        use_temporal_clustering: bool = True,
        use_channel_clustering: bool = True,
    ):
        super().__init__()
        self.input_dim = input_dim
        self.sequence_length = sequence_length
        self.hidden_dim = hidden_dim
        self.output_targets = output_targets
        self.output_horizons = output_horizons
        self.use_temporal_clustering = use_temporal_clustering
        self.use_channel_clustering = use_channel_clustering

        if target_indices is None:
            self.target_indices = [FEATURE_COLUMNS.index(t) for t in TARGET_COLUMNS]
        else:
            self.target_indices = target_indices

        # Channel positional embedding
        self.channel_pos_embed = nn.Parameter(torch.zeros(1, input_dim, hidden_dim))
        nn.init.trunc_normal_(self.channel_pos_embed, std=0.02)

        # Single temporal linear embedding baseline for ablation
        self.fallback_seq_embedding = nn.Linear(sequence_length, hidden_dim)

        # 1. Temporal Clustering Module (TCM)
        self.tcm = TemporalClusteringModule(
            sequence_length=sequence_length,
            hidden_dim=hidden_dim,
            num_clusters=num_temporal_clusters,
            dropout=dropout,
        )

        # 2. Channel Clustering Module (CCM)
        self.ccm = ChannelClusteringModule(
            input_dim=input_dim,
            sequence_length=sequence_length,
            num_clusters=num_channel_clusters,
            top_k=6,
        )

        # 3. Fusion Modules (FM layers)
        self.fusion_layers = nn.ModuleList([
            FusionModule(hidden_dim=hidden_dim, nhead=nhead, dropout=dropout)
            for _ in range(num_layers)
        ])

        # 4. Target Projection Heads
        self.target_heads = nn.ModuleList([
            nn.Sequential(
                nn.Linear(hidden_dim, hidden_dim),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(hidden_dim, output_horizons),
            )
            for _ in range(output_targets)
        ])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass for DUETModel.
        Input x: [B, T, 14] or [T, 14]
        Returns: [B, 3, 5]
        """
        is_single = (x.ndim == 2)
        if is_single:
            x = x.unsqueeze(0)

        B, T, D = x.shape
        if D != self.input_dim:
            raise ValueError(f"Expected feature dimension {self.input_dim}, got {D}")

        # Reversible Instance Normalization along time dimension
        mean = x.mean(dim=1, keepdim=True)
        stdev = torch.sqrt(torch.var(x, dim=1, keepdim=True, unbiased=False) + 1e-5)
        x_norm = (x - mean) / stdev

        # Invert dimensions: [B, T, D] -> [B, D, T]
        x_inverted = x_norm.permute(0, 2, 1)

        # 1. Temporal Clustering Module (TCM)
        if self.use_temporal_clustering:
            h_tcm, _ = self.tcm(x_inverted)  # [B, D, hidden_dim]
        else:
            h_tcm = self.fallback_seq_embedding(x_inverted)

        h_tcm = h_tcm + self.channel_pos_embed

        # 2. Channel Clustering Module (CCM)
        if self.use_channel_clustering:
            channel_mask, _ = self.ccm(x_norm)  # [B, D, D]
        else:
            channel_mask = torch.ones(B, D, D, device=x.device) / float(D)

        # 3. Fusion Module layers
        h = h_tcm
        for fusion_layer in self.fusion_layers:
            h = fusion_layer(h, channel_mask)  # [B, D, hidden_dim]

        # 4. Target Heads projection
        outputs = []
        for m_idx, channel_idx in enumerate(self.target_indices):
            target_token = h[:, channel_idx, :]  # [B, hidden_dim]
            pred_h = self.target_heads[m_idx](target_token)  # [B, 5]
            outputs.append(pred_h.unsqueeze(1))  # [B, 1, 5]

        out = torch.cat(outputs, dim=1)  # [B, 3, 5]

        if is_single:
            out = out.squeeze(0)

        return out

    def get_parameter_counts(self) -> tuple[int, int]:
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return total_params, trainable_params
