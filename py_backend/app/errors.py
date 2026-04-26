from __future__ import annotations

from fastapi import HTTPException


def must(value, name: str) -> None:
    if value is None:
        raise HTTPException(status_code=400, detail=f'{name} is required')
    if isinstance(value, str) and not value.strip():
        raise HTTPException(status_code=400, detail=f'{name} is required')


def must_thread_type(thread_type: str) -> None:
    must(thread_type, 'threadType')
    if thread_type not in {'direct', 'group', 'channel'}:
        raise HTTPException(status_code=400, detail='Unsupported threadType')


def phone_variants(raw: str) -> list[str]:
    digits = ''.join(ch for ch in str(raw or '') if ch.isdigit())
    variants = {digits}
    if digits.startswith('0') and len(digits) > 1:
        variants.add(f'92{digits[1:]}')
    if digits.startswith('92') and len(digits) > 2:
        variants.add(f'0{digits[2:]}')
    return [v for v in variants if v]
