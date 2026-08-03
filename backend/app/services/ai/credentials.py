import os
from cryptography.fernet import Fernet, InvalidToken


def get_fernet_key() -> bytes:
    key_str = os.environ.get("AI_CREDENTIAL_ENCRYPTION_KEY")
    if not key_str:
        raise ValueError(
            "AI_CREDENTIAL_ENCRYPTION_KEY environment variable is not configured on server."
        )
    try:
        return key_str.encode("utf-8")
    except Exception:
        raise ValueError("Invalid AI_CREDENTIAL_ENCRYPTION_KEY environment variable.")


def encrypt_api_key(plain_key: str) -> str:
    if not plain_key:
        raise ValueError("API key cannot be empty.")
    fernet_key = get_fernet_key()
    try:
        fernet = Fernet(fernet_key)
        return fernet.encrypt(plain_key.encode("utf-8")).decode("utf-8")
    except Exception:
        raise ValueError("Failed to encrypt API credential. Verify encryption key configuration.")


def decrypt_api_key(encrypted_key: str) -> str:
    if not encrypted_key:
        raise ValueError("Encrypted API key is empty.")
    fernet_key = get_fernet_key()
    try:
        fernet = Fernet(fernet_key)
        return fernet.decrypt(encrypted_key.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        raise ValueError("Failed to decrypt API credential. Encryption key token mismatch.")
    except Exception:
        raise ValueError("Failed to decrypt API credential.")


def create_key_preview(plain_key: str) -> str:
    if not plain_key:
        return ""
    suffix = plain_key[-4:] if len(plain_key) >= 4 else plain_key
    return f"••••••••{suffix}"
