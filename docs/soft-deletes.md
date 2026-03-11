# Soft Deletes Implementation Guide

## Overview

Soft deletes allow data to be marked as deleted without permanently removing it from the database. This provides:

- **Data Recovery:** Accidentally deleted data can be restored
- **Audit Trail:** Track when and what was deleted
- **GDPR Compliance:** Soft deletes first, hard delete on confirmed request
- **Referential Integrity:** Foreign keys remain valid

**Affected Tables:**
- sports
- leagues
- seasons
- teams
- players
- matches

**Not Soft-Deleted:**
- match_state (always tied to match)
- match_events (immutable append-only log)
- match_stats (always tied to match)
- news_articles (short-lived data)
- subscriptions (ephemeral)

---

## Database Changes

### Migration: `008_soft_deletes.sql`

Adds `deleted_at` column (TIMESTAMPTZ, nullable) to each table:

```sql
ALTER TABLE leagues ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_leagues_deleted ON leagues(deleted_at) WHERE deleted_at IS NULL;
```

**Key Indices:**
- `idx_*_deleted`: Fast filtering (WHERE deleted_at IS NULL)
- Composite indices: Combined deletion + active status filters

**Helper Functions:**
```sql
-- Soft delete (set deleted_at = NOW())
SELECT soft_delete_entity('leagues', league_id, 'Reason');

-- Restore (set deleted_at = NULL)
SELECT restore_entity('leagues', league_id);

-- Hard delete (permanent removal - GDPR only)
SELECT hard_delete_entity('leagues', league_id, 'GDPR request');
```

---

## ORM Updates

### SQLAlchemy Models

Each soft-deletable model now includes:

```python
from datetime import datetime
from typing import Optional

class LeagueORM(Base):
    __tablename__ = "leagues"
    
    # ... existing fields ...
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), 
        default=None, 
        nullable=True
    )
```

All affected ORM models updated:
- `SportORM`
- `LeagueORM`
- `SeasonORM`
- `TeamORM`
- `PlayerORM`
- `MatchORM`

---

## Usage Patterns

### Query Active Records Only

```python
from sqlalchemy import select
from backend.shared.models.orm import LeagueORM

# Get all active (not deleted) leagues
stmt = select(LeagueORM).where(LeagueORM.deleted_at.is_(None))
leagues = await session.execute(stmt)
```

### Query Soft-Deleted Records

```python
# Get all deleted leagues (for recovery)
stmt = select(LeagueORM).where(LeagueORM.deleted_at.isnot(None))
deleted_leagues = await session.execute(stmt)
```

### Soft Delete (Mark as Deleted)

**Option 1: ORM (Recommended)**
```python
# Mark league as deleted
league = await session.get(LeagueORM, league_id)
league.deleted_at = datetime.now(timezone.utc)
await session.commit()
```

**Option 2: Raw SQL (Batch Operations)**
```python
from sqlalchemy import text

await session.execute(
    text(f"UPDATE leagues SET deleted_at = NOW() WHERE id = '{league_id}'")
)
await session.commit()
```

**Option 3: PostgreSQL Function**
```python
# Call directly in database
stmt = text("SELECT soft_delete_entity('leagues', '{league_id}', 'User request')")
await session.execute(stmt)
```

### Restore (Undelete)

```python
# Restore a deleted league
league = await session.get(LeagueORM, league_id)
league.deleted_at = None
await session.commit()
```

### Hard Delete (Permanent, GDPR Only)

```python
# WARNING: Permanently removes data - no recovery!
# Use only for GDPR requests
from sqlalchemy import text

await session.execute(
    text("SELECT hard_delete_entity('leagues', '{league_id}', 'GDPR request')")
)
await session.commit()
```

---

## API Changes

### Soft Delete Endpoint

Add endpoint to allow soft delete in your routes:

```python
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from typing import UUID

router = APIRouter()

@router.delete("/leagues/{league_id}")
async def delete_league(
    league_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Soft-delete a league (marks as deleted, recoverable)."""
    league = await session.get(LeagueORM, league_id)
    if not league:
        raise HTTPException(404, "League not found")
    
    league.deleted_at = datetime.now(timezone.utc)
    league.updated_at = datetime.now(timezone.utc)
    await session.commit()
    
    return {"status": "deleted", "league_id": league_id}
```

### Add Restore Endpoint

```python
@router.post("/leagues/{league_id}/restore")
async def restore_league(
    league_id: UUID,
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(require_admin),
):
    """Restore a soft-deleted league."""
    league = await session.get(LeagueORM, league_id)
    if not league:
        raise HTTPException(404, "League not found")
    
    if league.deleted_at is None:
        raise HTTPException(400, "League is not deleted")
    
    league.deleted_at = None
    league.updated_at = datetime.now(timezone.utc)
    await session.commit()
    
    return {"status": "restored", "league_id": league_id}
```

### Query Parameters for Admin Endpoints

```python
@router.get("/admin/leagues")
async def list_leagues(
    session: AsyncSession = Depends(get_session),
    include_deleted: bool = Query(False, description="Include soft-deleted leagues"),
    current_user: User = Depends(require_admin),
):
    """List leagues, optionally including soft-deleted ones."""
    stmt = select(LeagueORM)
    
    if not include_deleted:
        stmt = stmt.where(LeagueORM.deleted_at.is_(None))
    
    result = await session.execute(stmt)
    return result.scalars().all()
```

---

## Best Practices

### 1. Always Filter Active Records

Apply soft delete filter to all user-facing queries:

```python
# ❌ WRONG: Includes deleted records
stmt = select(LeagueORM)

# ✅ CORRECT: Only active records
stmt = select(LeagueORM).where(LeagueORM.deleted_at.is_(None))
```

### 2. Use Timestamps for Audit

```python
# When deleting
league.deleted_at = datetime.now(timezone.utc)
league.updated_at = datetime.now(timezone.utc)  # Track when updated
```

### 3. Create Deletion Reason Log

```python
class DeletionLogORM(Base):
    __tablename__ = "deletion_logs"
    
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str]  # 'league', 'team', etc.
    entity_id: Mapped[UUID]
    reason: Mapped[str]
    deleted_by: Mapped[UUID]  # user_id
    deleted_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    restored_at: Mapped[Optional[datetime]] = None
```

### 4. Ad-Hoc Recovery Queries

```sql
-- Find leagues deleted in last 30 days
SELECT * FROM leagues 
WHERE deleted_at > NOW() - INTERVAL '30 days'
ORDER BY deleted_at DESC;

-- Find who deleted the most leagues
SELECT entity_type, COUNT(*) as count
FROM deletion_logs
WHERE deleted_at > NOW() - INTERVAL '1 month'
GROUP BY entity_type;

-- Restore all leagues deleted in last week (emergency recovery)
UPDATE leagues 
SET deleted_at = NULL 
WHERE deleted_at > NOW() - INTERVAL '7 days';
```

### 5. Cascade Soft Deletes (Optional)

When deleting a parent, also soft-delete children:

```python
# When deleting a league, also soft-delete its seasons
league = await session.get(LeagueORM, league_id)
league.deleted_at = datetime.now(timezone.utc)

for season in league.seasons:
    season.deleted_at = datetime.now(timezone.utc)

await session.commit()
```

---

## Testing Soft Deletes

### Unit Test

```python
import pytest
from sqlalchemy import select

@pytest.mark.asyncio
async def test_soft_delete_league(session):
    """Test that soft delete hides records."""
    league = LeagueORM(name="Test League", sport_id=sport_id)
    session.add(league)
    await session.commit()
    
    league_id = league.id
    
    # Soft delete
    league.deleted_at = datetime.now(timezone.utc)
    await session.commit()
    
    # Query active should not return it
    stmt = select(LeagueORM).where(LeagueORM.deleted_at.is_(None))
    result = await session.execute(stmt)
    active = result.scalars().all()
    assert league_id not in [l.id for l in active]
    
    # Query with deletion filter should return it
    stmt = select(LeagueORM).where(LeagueORM.deleted_at.isnot(None))
    result = await session.execute(stmt)
    deleted = result.scalars().all()
    assert league_id in [l.id for l in deleted]
```

### Integration Test

```python
@pytest.mark.asyncio
async def test_restore_league(client, league_id):
    """Test restoration of soft-deleted league."""
    # Delete league
    response = await client.delete(f"/leagues/{league_id}")
    assert response.status_code == 200
    
    # Verify deleted
    response = await client.get(f"/leagues/{league_id}")
    assert response.status_code == 404
    
    # Restore league
    response = await client.post(f"/leagues/{league_id}/restore")
    assert response.status_code == 200
    
    # Verify restored
    response = await client.get(f"/leagues/{league_id}")
    assert response.status_code == 200
```

---

## Migration Steps

### Step 1: Run Migration

```bash
cd backend
psql -U liveview -d liveview_prod -f migrations/008_soft_deletes.sql
```

### Step 2: Update ORM Models

✅ Already done - all models updated with `deleted_at` field.

### Step 3: Update Query Filters

Search for queries that need soft delete filtering:

```bash
grep -r "select(.*ORM)" backend/api/routes/
```

Add `.where(Model.deleted_at.is_(None))` to user-facing queries.

### Step 4: Test

```bash
pytest backend/tests/test_soft_deletes.py -v
```

### Step 5: Deploy

```bash
git add backend/migrations/008_soft_deletes.sql backend/shared/models/orm.py
git commit -m "feat: add soft delete support for data recovery and audit trail"
git push origin main
```

---

## Monitoring Soft Deletes

### Metrics to Track

```python
# Added to /metrics endpoint
SOFT_DELETED_LEAGUES = Counter("soft_deleted_leagues", "Total soft-deleted leagues")
SOFT_DELETED_TEAMS = Counter("soft_deleted_teams", "Total soft-deleted teams")
RESTORED_LEAGUES = Counter("restored_leagues", "Total restored leagues")
```

### Alerting

Configure alerts for:
- Large batch deletions (potential data corruption)
- Deletion patterns (e.g., all teams deleted at once)
- Restoration requests (unusual access pattern)

---

## Rollback Plan

If soft deletes cause issues:

```sql
-- Remove soft delete columns (data preserved)
ALTER TABLE leagues DROP COLUMN deleted_at;
ALTER TABLE teams DROP COLUMN deleted_at;
-- ... etc for all tables

-- Revert ORM models: git checkout HEAD~1 backend/shared/models/orm.py

-- Redeploy without the migration
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Full schema documentation
- [BACKUP_STRATEGY.md](BACKUP_STRATEGY.md) - Data recovery procedures
- [GDPR_COMPLIANCE.md](GDPR_COMPLIANCE.md) - Hard delete procedures

