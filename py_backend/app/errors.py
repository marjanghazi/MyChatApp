from __future__ import annotations

from fastapi import HTTPException

import re


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
    value = str(raw or '').strip()
    if re.search(r'[A-Za-z]', value):
        raise HTTPException(status_code=400, detail='Enter a valid phone number with country code')
    digits = re.sub(r'\D', '', value)
    if digits.startswith('00'):
        digits = digits[2:]
    if re.fullmatch(r'03\d{9}', digits):
        digits = '92' + digits[1:]
    elif re.fullmatch(r'3\d{9}', digits):
        digits = '92' + digits
    elif not (value.startswith('+') or re.fullmatch(r'[1-9]\d{7,14}', digits)):
        raise HTTPException(status_code=400, detail='Enter a valid phone number with country code')
    if not re.fullmatch(r'[1-9]\d{7,14}', digits):
        raise HTTPException(status_code=400, detail='Enter a valid phone number with country code')
    if digits.startswith('92') and not re.fullmatch(r'923\d{9}', digits):
        raise HTTPException(status_code=400, detail='Enter a valid Pakistan mobile number')
    variants = [digits]
    if digits.startswith('923'):
        variants.extend(['0' + digits[2:], digits[2:]])
    return variants
