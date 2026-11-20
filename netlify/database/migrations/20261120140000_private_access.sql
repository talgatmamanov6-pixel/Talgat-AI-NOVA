-- Ten private user slots. The verified owner is separate and never occupies a slot.
CREATE TABLE talgat_private_access (
 slot smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 10),
 email text UNIQUE CHECK (email IS NULL OR (email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254)),
 updated_by text REFERENCES talgat_accounts(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO talgat_private_access(slot) SELECT generate_series(1,10);
