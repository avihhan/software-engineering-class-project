-- Tenant billing configuration + member payment gate state.
-- Designed for single-plan now, extensible to multi-plan/providers later.

CREATE TABLE IF NOT EXISTS public.tenant_billing_configs (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id              bigint NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
    provider               varchar NOT NULL DEFAULT 'lemon_squeezy',
    enabled                boolean NOT NULL DEFAULT false,
    trial_days             integer NOT NULL DEFAULT 7,
    store_id               varchar,
    product_id             varchar,
    variant_id             varchar,
    plan_name              varchar,
    plan_description       text,
    offer_description      text,
    price_cents            integer,
    currency               varchar(3) NOT NULL DEFAULT 'USD',
    discount_type          varchar NOT NULL DEFAULT 'none',
    discount_value         numeric(10, 2),
    created_at             timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_configs_tenant_id
ON public.tenant_billing_configs (tenant_id);

CREATE TABLE IF NOT EXISTS public.tenant_member_billing_status (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id              bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id                bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status                 varchar NOT NULL DEFAULT 'trialing',
    trial_ends_at          timestamp NOT NULL,
    lemon_customer_id      varchar,
    lemon_subscription_id  varchar,
    lemon_order_id         varchar,
    last_checkout_url      text,
    last_checkout_at       timestamp,
    paid_at                timestamp,
    created_at             timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tenant_member_billing_status_tenant_user_key UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_member_billing_status_lookup
ON public.tenant_member_billing_status (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_member_billing_status_subscription
ON public.tenant_member_billing_status (lemon_subscription_id);
