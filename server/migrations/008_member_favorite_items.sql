-- Member favorites for workout logs and nutrition logs.

CREATE TABLE IF NOT EXISTS public.member_favorite_items (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id   bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id     bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    item_type   varchar NOT NULL,
    item_id     bigint NOT NULL,
    created_at  timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT member_favorite_items_type_check CHECK (item_type IN ('workout', 'nutrition')),
    CONSTRAINT member_favorite_items_unique UNIQUE (tenant_id, user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_member_favorite_items_lookup
ON public.member_favorite_items (tenant_id, user_id, item_type, created_at DESC);
