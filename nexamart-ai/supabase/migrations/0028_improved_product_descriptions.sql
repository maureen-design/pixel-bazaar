-- Improved product descriptions for top demo products
-- Run this in Supabase SQL Editor

UPDATE products SET description = 'Samsung''s most powerful smartphone with built-in AI tools for translation, photo editing, and search. Features a 200MP camera, titanium frame, and all-day battery life. Best for power users who want the latest AI features without compromises.' WHERE slug = 'samsung-galaxy-s24-ultra';

UPDATE products SET description = 'Professional-grade laptop with M3 Pro chip for demanding creative and development work. 36GB unified memory handles large files, multiple monitors, and complex workflows effortlessly. The 16-inch Liquid Retina display delivers accurate colors for design and video work.' WHERE slug = 'apple-macbook-pro-16';

UPDATE products SET description = 'Apple''s flagship phone with A18 Pro chip and a titanium design that''s lighter than stainless steel. The pro-grade camera system captures 48MP photos and spatial video for Apple Vision Pro. Ideal for iPhone users who want the best camera and longest battery life.' WHERE slug = 'iphone-16-pro';

UPDATE products SET description = 'James Clear''s guide to building good habits and breaking bad ones through tiny daily changes. Backed by scientific research with practical strategies you can apply immediately. A must-read for anyone looking to make lasting lifestyle changes.' WHERE slug = 'atomic-habits';

UPDATE products SET description = 'Iconic men''s fragrance with fresh bergamot and spicy Sichuan pepper notes that evolve into a warm, woody dry-down. Long-lasting formula that works for both daytime and evening wear. A versatile signature scent that''s consistently a top seller.' WHERE slug = 'dior-sauvage';

UPDATE products SET description = 'Soft, breathable 100% cotton t-shirt in Black, White, Navy, and Red. Classic fit that works as a standalone piece or layered under jackets and hoodies. A wardrobe essential that holds its shape wash after wash.' WHERE slug = 'classic-cotton-tshirt';

UPDATE products SET description = 'Heavyweight cotton-blend hoodie with a soft fleece interior for warmth. Available in Black, Grey, and Olive with a relaxed fit for layering. Perfect for casual outings or lounging at home.' WHERE slug = 'premium-hoodie';

UPDATE products SET description = 'Industry-leading noise cancellation with 30-hour battery life and ultra-comfortable lightweight design. Multipoint connection lets you switch between phone and laptop seamlessly. Best for commuters and frequent travelers who need to focus.' WHERE slug = 'sony-wh-1000xm5';

UPDATE products SET description = 'Clean-lined 140x65cm desk with a smooth white finish and cable management cutout. Spacious surface fits a laptop, monitor, and accessories without feeling cramped. A popular choice for home offices and study spaces.' WHERE slug = 'ikea-malm-desk';

UPDATE products SET description = 'Lightweight, breathable blouse with a flattering cut that transitions from office to weekend. Pairs well with jeans, skirts, or tailored trousers for versatile everyday styling. Available in multiple colors to match your wardrobe.' WHERE slug = 'womens-blouse';

UPDATE products SET description = 'Classic denim jacket in a medium wash with a button-front closure and chest pockets. Durable construction that gets better with age as the fabric softens and develops character. A layering staple that works across all seasons.' WHERE slug = 'mens-denim-jacket';

UPDATE products SET description = 'Vibrant Ankara print dress with a tailored fit that flatters all body types. Bold African-inspired pattern that makes a statement at events, parties, or casual outings. Designed for comfort with breathable fabric and a relaxed silhouette.' WHERE slug = 'ankara-dress';
