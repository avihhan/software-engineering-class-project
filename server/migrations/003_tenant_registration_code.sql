-- Add tenant signup registration code support (plain visible 6-digit code).

ALTER TABLE public.tenants
ADD COLUMN IF NOT EXISTS registration_code varchar(6);

DO $$
DECLARE
    tenant_row RECORD;
    candidate varchar(6);
BEGIN
    FOR tenant_row IN
        SELECT id
        FROM public.tenants
        WHERE registration_code IS NULL
           OR registration_code !~ '^\d{6}$'
    LOOP
        LOOP
            candidate := LPAD((FLOOR(RANDOM() * 1000000))::int::text, 6, '0');
            EXIT WHEN NOT EXISTS (
                SELECT 1
                FROM public.tenants t2
                WHERE t2.registration_code = candidate
            );
        END LOOP;

        UPDATE public.tenants
        SET registration_code = candidate
        WHERE id = tenant_row.id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_registration_code_key
ON public.tenants (registration_code);
