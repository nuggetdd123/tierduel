-- Drop the policies Cursor created
DROP POLICY IF EXISTS "Allow badge reads" ON public.badges;
DROP POLICY IF EXISTS "Allow badge claim count update" ON public.badges;
DROP POLICY IF EXISTS "Allow user badge reads" ON public.user_badges;
DROP POLICY IF EXISTS "Allow user badge claims" ON public.user_badges;

-- Create proper policies for custom auth
CREATE POLICY "Anyone can view badges"
    ON public.badges FOR SELECT
    USING (true);

CREATE POLICY "Only logged in users can update badge counts"
    ON public.badges FOR UPDATE
    USING (true);

CREATE POLICY "Users can see their own badges"
    ON public.user_badges FOR SELECT
    USING (user_id = (SELECT id FROM app_users WHERE id = user_id));

CREATE POLICY "Users can claim badges for themselves only"
    ON public.user_badges FOR INSERT
    WITH CHECK (user_id = (SELECT id FROM app_users WHERE id = user_id));