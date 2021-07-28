
-- WARNING: this database is shared with postgraphile-core, don't run the tests in parallel!
 DROP SCHEMA IF EXISTS graphile_federation, graphile_federation2 CASCADE;

CREATE SCHEMA graphile_federation;

CREATE TABLE graphile_federation.users (
	id SERIAL PRIMARY KEY,
	first_name TEXT NOT NULL,
	last_name TEXT NOT NULL
);

CREATE TABLE graphile_federation.emails (
	id SERIAL PRIMARY KEY,
	email TEXT NOT NULL
);

CREATE TABLE graphile_federation.users_emails (
	user_id INT NOT NULL REFERENCES graphile_federation.users(id),
	email_id INT NOT NULL REFERENCES graphile_federation.emails(id),
	PRIMARY KEY (
		user_id,
		email_id
	)
) ;

INSERT
	INTO
	graphile_federation.users (
		id,
		first_name,
		last_name
	)
VALUES (
	1,
	'alicia',
	'keys'
),
(
	2,
	'bob',
	'marley'
),
(
	3,
	'charles',
	'bradley'
);

INSERT
	INTO
	graphile_federation.emails (
		id,
		email
	)
VALUES (
	1,
	'piano@example.com'
),
(
	2,
	'alicia@example.com'
);

INSERT
	INTO
	graphile_federation.users_emails (
		user_id,
		email_id
	)
VALUES (
	1,
	1
),
(
	1,
	2
);

CREATE SCHEMA graphile_federation2;
CREATE TABLE graphile_federation2.forums (
	id SERIAL PRIMARY KEY,
	title TEXT NOT NULL
);
CREATE TABLE graphile_federation2.posts (
	id SERIAL PRIMARY KEY,
  forum_id int not null references graphile_federation2.forums,
	body TEXT NOT NULL
);

insert into graphile_federation2.forums (title) values
  ('Cats'),
  ('Dogs'),
  ('Postgres');

insert into graphile_federation2.posts (forum_id, body) values
  (1, 'They are sneaky'),
  (2, 'They are loyal'),
  (3, 'It''s awesome');
