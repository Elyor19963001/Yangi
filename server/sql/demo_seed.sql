-- DEMO / PILOT SEED.
-- Tuman nomlari Samarqand viloyati hokimligining amaldagi shahar va tumanlar ro‘yxatiga moslashtirilgan.
-- Koordinatalar weather route orqali Open-Meteo geocoding yordamida birinchi so‘rovda aniqlanadi va bazaga cache qilinadi.

UPDATE districts SET name='Bulung‘ur tumani' WHERE name='Tuman 01';
UPDATE districts SET name='Jomboy tumani' WHERE name='Tuman 02';
UPDATE districts SET name='Ishtixon tumani' WHERE name='Tuman 03';
UPDATE districts SET name='Kattaqo‘rg‘on tumani' WHERE name='Tuman 04';
UPDATE districts SET name='Narpay tumani' WHERE name='Tuman 05';
UPDATE districts SET name='Nurobod tumani' WHERE name='Tuman 06';
UPDATE districts SET name='Oqdaryo tumani' WHERE name='Tuman 07';
UPDATE districts SET name='Payariq tumani' WHERE name='Tuman 08';
UPDATE districts SET name='Pastdarg‘om tumani' WHERE name='Tuman 09';
UPDATE districts SET name='Paxtachi tumani' WHERE name='Tuman 10';
UPDATE districts SET name='Samarqand tumani' WHERE name='Tuman 11';
UPDATE districts SET name='Toyloq tumani' WHERE name='Tuman 12';
UPDATE districts SET name='Urgut tumani' WHERE name='Tuman 13';
UPDATE districts SET name='Qo‘shrabot tumani' WHERE name='Tuman 14';

INSERT INTO districts (name) VALUES
('Bulung‘ur tumani'),('Jomboy tumani'),('Ishtixon tumani'),('Kattaqo‘rg‘on tumani'),
('Narpay tumani'),('Nurobod tumani'),('Oqdaryo tumani'),('Payariq tumani'),
('Pastdarg‘om tumani'),('Paxtachi tumani'),('Samarqand tumani'),('Toyloq tumani'),
('Urgut tumani'),('Qo‘shrabot tumani')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, category) VALUES
('Pomidor','Sabzavot'),('Kartoshka','Sabzavot'),('Piyoz','Sabzavot'),('Olma','Meva'),('Uzum','Meva')
ON CONFLICT (name) DO NOTHING;

-- Bu bozorlar faqat narx moduli texnik testi uchun DEMO. Xarita modulida real yaqin joylar OpenStreetMap orqali olinadi.
INSERT INTO markets (name, district_id, verification_status)
SELECT 'DEMO bozor ' || d.district_id, d.district_id, 'unverified'
FROM districts d
ORDER BY d.district_id
LIMIT 5
ON CONFLICT DO NOTHING;

INSERT INTO prices (product_id, market_id, district_id, price, unit, source)
SELECT p.product_id, m.market_id, m.district_id,
       (8000 + p.product_id*700 + m.market_id*300)::numeric, 'kg', 'DEMO'
FROM products p CROSS JOIN markets m
WHERE m.name LIKE 'DEMO%'
ON CONFLICT DO NOTHING;

INSERT INTO government_programs (title, program_type, summary, eligibility)
SELECT * FROM (VALUES
('DEMO: Qishloq tadbirkorligi ko‘magi','grant','Bu demo yozuv. Rasmiy manba bilan almashtiriladi.','Pilot uchun test ma’lumoti'),
('DEMO: Raqamli ko‘nikmalar dasturi','training','Bu demo yozuv. Rasmiy manba bilan almashtiriladi.','Pilot uchun test ma’lumoti')
) AS v(title, program_type, summary, eligibility)
WHERE NOT EXISTS (SELECT 1 FROM government_programs gp WHERE gp.title=v.title);
