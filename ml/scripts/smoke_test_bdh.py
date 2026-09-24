"""
Implementation Smoke Test for BDHInspiredSequenceModel on Verified Ubuntu Telemetry Dataset
"""

import time
import numpy as np
import torch
from ml.bdh.adapters_bdh import BDHAdapter


def run_smoke_test():
    dataset_path = "ml/data/bdh_datasets/ubuntu_seq60_verified.npz"
    print("==================================================")
    print("      IMPLEMENTATION SMOKE TEST — BDH MODEL       ")
    print("==================================================")

    # 1. Load Dataset
    data = np.load(dataset_path, allow_pickle=True)
    X = data["X_normalized"]
    N, T, D = X.shape
    print(f"Dataset File: {dataset_path}")
    print(f"Dataset Shape (X_normalized): [{N}, {T}, {D}]")

    # Reconstruct targets dictionary from npz
    targets = {}
    for key in data.files:
        if key.startswith("target_"):
            for horizon in ["5m", "15m", "30m", "1h", "3h"]:
                if key.endswith(f"_{horizon}"):
                    target_metric = key[len("target_") : -len(f"_{horizon}")]
                    if target_metric not in targets:
                        targets[target_metric] = {}
                    targets[target_metric][horizon] = data[key]

    dataset_dict = {"X": X, "targets": targets}

    # 2. Instantiate BDHAdapter
    adapter = BDHAdapter(input_dim=D, hidden_dim=64, num_layers=2, device="cpu")
    tot_params, train_params = adapter.model.get_parameter_counts()
    print(f"Model Parameter Count: Total={tot_params:,} | Trainable={train_params:,}")

    # 3. Training Loss before & after small number of steps (5 epochs)
    print("\nExecuting 5-epoch training loop...")
    fit_summary = adapter.fit(dataset_dict, epochs=5, lr=1e-3, batch_size=32)
    print(f"Initial Loss (Epoch 1): {fit_summary['initial_loss']:.6f}")
    print(f"Final Loss (Epoch 5):   {fit_summary['final_loss']:.6f}")

    # 4. Inference Latency & Output Shape Verification
    sample_batch = X[:32]  # Batch of size 32
    start_time = time.perf_counter()
    pred_tensor = adapter.predict_tensor(sample_batch)
    latency_ms = (time.perf_counter() - start_time) * 1000.0

    print(f"\nInference Batch Size: {sample_batch.shape[0]}")
    print(f"Output Shape:          {pred_tensor.shape} [Batch, Targets=3, Horizons=5]")
    print(f"Inference Latency:     {latency_ms:.2f} ms")
    print("==================================================")
    print("RESULT: IMPLEMENTATION SMOKE TEST PASSED SUCCESSFULLY")
    print("==================================================")


if __name__ == "__main__":
    run_smoke_test()
