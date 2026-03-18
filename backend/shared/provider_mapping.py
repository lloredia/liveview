"""Shared helpers for safe provider-to-canonical identity mapping."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from shared.models.orm import ProviderMappingORM
from shared.utils.logging import get_logger
from shared.utils.metrics import PROVIDER_MAPPING_CONFLICTS

logger = get_logger(__name__)


async def ensure_provider_mapping_consistency(
    session: Any,
    *,
    entity_type: str,
    canonical_id: uuid.UUID,
    provider: str,
    provider_id: str,
    conflict_event: str = "provider_mapping_conflict",
) -> bool:
    """Persist a provider mapping without remapping an existing provider id to a different canonical record."""
    mapping = (
        await session.execute(
            select(ProviderMappingORM).where(
                ProviderMappingORM.entity_type == entity_type,
                ProviderMappingORM.provider == provider,
                ProviderMappingORM.provider_id == provider_id,
            )
        )
    ).scalar_one_or_none()

    if mapping:
        if mapping.canonical_id != canonical_id:
            PROVIDER_MAPPING_CONFLICTS.labels(
                provider=provider,
                entity_type=entity_type,
            ).inc()
            logger.warning(
                conflict_event,
                entity_type=entity_type,
                provider=provider,
                provider_id=provider_id,
                existing_canonical_id=str(mapping.canonical_id),
                attempted_canonical_id=str(canonical_id),
            )
            return False
        mapping.updated_at = datetime.now(timezone.utc)
        return True

    session.add(
        ProviderMappingORM(
            id=uuid.uuid4(),
            entity_type=entity_type,
            canonical_id=canonical_id,
            provider=provider,
            provider_id=provider_id,
        )
    )
    await session.flush()
    return True
