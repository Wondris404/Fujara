# ADR 003 — Playlist conflicts

Date: 2026-11-14

Playlist sync is last-writer-wins by integer version, then `updatedAt`. Operations carry idempotency keys so retries do not double-apply. Collaborative merging is out of scope.
