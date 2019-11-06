CREATE TABLE account (
    account_id SERIAL PRIMARY KEY,
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL
);

INSERT INTO account (first_name, last_name) VALUES 
    ('Charlotte', 'Williams'),
    ('Jessica', 'Rodriguez'),
    ('Emily', 'Davis'),
    ('Jan', 'Mata'),
    ('Michael', 'Williams'),
    ('Jules', 'Michael');

CREATE ROLE accountsuser WITH LOGIN ENCRYPTED PASSWORD 'jw8s0F4';
GRANT ALL ON ALL TABLES IN SCHEMA public TO accountsuser;

