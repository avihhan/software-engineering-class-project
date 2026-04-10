-- Tenant-scoped content feed for education/resources.
-- Owners can publish posts; members can like/comment within same tenant.

CREATE TABLE IF NOT EXISTS public.tenant_feed_posts (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    author_user_id  bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type            varchar NOT NULL DEFAULT 'post',
    title           varchar,
    body            text,
    media_url       text,
    media_path      text,
    media_mime      varchar,
    is_published    boolean NOT NULL DEFAULT true,
    created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tenant_feed_posts_type_check CHECK (type IN ('video', 'article', 'post', 'resource'))
);

CREATE INDEX IF NOT EXISTS idx_tenant_feed_posts_tenant_created
ON public.tenant_feed_posts (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_feed_posts_author
ON public.tenant_feed_posts (author_user_id);

CREATE TABLE IF NOT EXISTS public.tenant_feed_likes (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id    bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    post_id      bigint NOT NULL REFERENCES public.tenant_feed_posts(id) ON DELETE CASCADE,
    user_id      bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT tenant_feed_likes_post_user_key UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_feed_likes_post
ON public.tenant_feed_likes (tenant_id, post_id);

CREATE INDEX IF NOT EXISTS idx_tenant_feed_likes_user
ON public.tenant_feed_likes (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS public.tenant_feed_comments (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id    bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    post_id      bigint NOT NULL REFERENCES public.tenant_feed_posts(id) ON DELETE CASCADE,
    user_id      bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    body         text NOT NULL,
    is_deleted   boolean NOT NULL DEFAULT false,
    created_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_feed_comments_post_created
ON public.tenant_feed_comments (tenant_id, post_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_feed_comments_user
ON public.tenant_feed_comments (tenant_id, user_id);
