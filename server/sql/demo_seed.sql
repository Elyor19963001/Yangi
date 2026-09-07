-- DEMO ONLY. Rasmiy pilotdan oldin tuman/bozor nomlari va koordinatalarini tasdiqlangan manba bilan almashtiring.
INSERT INTO districts (name) VALUES
('Tuman 01'),('Tuman 02'),('Tuman 03'),('Tuman 04'),('Tuman 05'),('Tuman 06'),('Tuman 07'),
('Tuman 08'),('Tuman 09'),('Tuman 10'),('Tuman 11'),('Tuman 12'),('Tuman 13'),('Tuman 14')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, category) VALUES
('Pomidor','Sabzavot'),('Kartoshka','Sabzavot'),('Piyoz','Sabzavot'),('Olma','Meva'),('Uzum','Meva')
ON CONFLICT (name) DO NOTHING;

INSERT INTO markets (name, district_id)
SELECT 'Demo bozor ' || d.district_id, d.district_id FROM districts d WHERE d.district_id <= 5
ON CONFLICT DO NOTHING;

INSERT INTO prices (product_id, market_id, district_id, price, unit, source)
SELECT p.product_id, m.market_id, m.district_id,
       (8000 + p.product_id*700 + m.market_id*300)::numeric, 'kg', 'DEMO'
FROM products p CROSS JOIN markets m
ON CONFLICT DO NOTHING;

INSERT INTO government_programs (title, program_type, summary, eligibility)
VALUES
('DEMO: Qishloq tadbirkorligi ko‘magi','grant','Bu demo yozuv. Rasmiy manba bilan almashtiriladi.','Pilot uchun test ma’lumoti'),
('DEMO: Raqamli ko‘nikmalar dasturi','training','Bu demo yozuv. Rasmiy manba bilan almashtiriladi.','Pilot uchun test ma’lumoti');
