-- Drop old submissions table if exists
DROP TABLE IF EXISTS public.submissions CASCADE;

-- Create new submissions table with tier
CREATE TABLE IF NOT EXISTS public.submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.app_users(id) NOT NULL,
    video_url TEXT NOT NULL,
    tier TEXT NOT NULL CHECK (tier IN ('HT1', 'LT1', 'HT2', 'LT2', 'HT3', 'LT3', 'HT4', 'LT4', 'HT5', 'LT5')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Update RLS policies
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Submissions lesen" ON public.submissions;
DROP POLICY IF EXISTS "Submissions erstellen" ON public.submissions;
DROP POLICY IF EXISTS "Submissions aktualisieren (eigene)" ON public.submissions;
DROP POLICY IF EXISTS "Submissions aktualisieren (Moderator)" ON public.submissions;

CREATE POLICY "Submissions lesen" ON public.submissions
    FOR SELECT USING (
        auth.uid() = user_id OR 
        EXISTS (SELECT 1 FROM public.app_users WHERE id = auth.uid() AND is_moderator = true)
    );

CREATE POLICY "Submissions erstellen" ON public.submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Submissions aktualisieren (Moderator)" ON public.submissions
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM public.app_users WHERE id = auth.uid() AND is_moderator = true)
    )
    WITH CHECK (
        EXISTS (SELECT 1 FROM public.app_users WHERE id = auth.uid() AND is_moderator = true)
    );

-- Also update the trigger to handle tier
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.app_users (id, username)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();