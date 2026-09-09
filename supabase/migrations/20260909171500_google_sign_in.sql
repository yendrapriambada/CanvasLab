-- Google sign-in: accounts can now exist without a local password, and are
-- matched back to the same Google identity on every subsequent sign-in.
ALTER TABLE "Khalifah Board".accounts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE "Khalifah Board".accounts ADD COLUMN google_sub text UNIQUE;
