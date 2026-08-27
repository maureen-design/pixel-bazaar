import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Package, Store, ShieldCheck, Sparkles } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useSettings } from '../hooks/useSettings';
import { useMarketplaceStats } from '../hooks/useMarketplaceStats';
import { Monogram } from './Monogram';
import { supabase } from '../lib/supabaseClient';

const SCATTER_POSITIONS = [
  { top: '8%', left: '3%', size: 'w-24 h-24', rotate: -8, speed: 7 },
  { top: '10%', right: '5%', size: 'w-28 h-28', rotate: 12, speed: 9 },
  { top: '25%', left: '18%', size: 'w-20 h-20', rotate: -5, speed: 6 },
  { top: '30%', right: '15%', size: 'w-22 h-22', rotate: 8, speed: 8 },
  { top: '50%', left: '5%', size: 'w-18 h-18', rotate: 10, speed: 10 },
  { top: '55%', right: '6%', size: 'w-20 h-20', rotate: -12, speed: 7 },
  { top: '65%', left: '20%', size: 'w-16 h-16', rotate: 6, speed: 9 },
  { top: '70%', right: '18%', size: 'w-18 h-18', rotate: -8, speed: 6 },
  { top: '15%', left: '35%', size: 'w-16 h-16', rotate: 14, speed: 8 },
  { top: '60%', right: '30%', size: 'w-14 h-14', rotate: -6, speed: 10 },
];

export function Hero() {
  const { settings } = useSettings();
  const { productCount, vendorCount } = useMarketplaceStats();
  const [scatterImages, setScatterImages] = useState<{ id: string; image: string }[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    supabase
      .from('products')
      .select('id, images')
      .eq('status', 'active')
      .not('images', 'is', null)
      .limit(20)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const withImages = data.filter((p) => p.images && p.images.length > 0);
        const shuffled = [...withImages].sort(() => Math.random() - 0.5);
        setScatterImages(
          shuffled.slice(0, SCATTER_POSITIONS.length).map((p) => ({
            id: p.id,
            image: p.images[0],
          }))
        );
      });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setMousePos({ x, y });
  }, []);

  const scrollToProducts = () => {
    const element = document.getElementById('products');
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToCategories = () => {
    const element = document.getElementById('categories');
    if (element) element.scrollIntoView({ behavior: 'smooth' });
  };

  const formatCount = (count: number | null) =>
    count === null ? '—' : count.toLocaleString('en-KE');

  const stats = [
    { icon: Package, value: formatCount(productCount), label: 'Products Online' },
    { icon: Store, value: vendorCount === null ? '—' : formatCount(vendorCount), label: 'Verified Vendors' },
    { icon: ShieldCheck, value: '✓', label: 'Buyer Protection' },
  ];

  return (
    <div
      ref={heroRef}
      onMouseMove={handleMouseMove}
      className="relative bg-gradient-to-br from-background via-primary/5 to-primary/10 overflow-hidden"
    >
      {/* Decorative Gradient Blobs — reduced */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-40 -right-40 w-64 h-64 bg-primary/8 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-64 h-64 bg-primary/8 rounded-full blur-3xl"
          animate={{ scale: [1.2, 1, 1.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Scattered Product Images */}
        {scatterImages.map((item, i) => {
          const pos = SCATTER_POSITIONS[i];
          const parallaxX = mousePos.x * (4 + pos.speed * 0.8);
          const parallaxY = mousePos.y * (4 + pos.speed * 0.8);

          return (
            <Link
              to={`/product/${item.id}`}
              key={item.id}
              className={`absolute ${pos.size} rounded-2xl overflow-hidden pointer-events-auto hidden sm:block hover:z-10 hover:scale-110 transition-transform duration-300`}
              style={{
                top: pos.top,
                left: pos.left,
                right: pos.right,
                boxShadow: '0 4px 24px hsl(0 0% 0% / 0.15)',
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.8, rotate: pos.rotate }}
                animate={
                  prefersReduced
                    ? { opacity: 0.25, scale: 1, rotate: pos.rotate, x: parallaxX, y: parallaxY }
                    : {
                        opacity: 0.25,
                        scale: [1, 1.06, 1],
                        rotate: pos.rotate,
                        x: parallaxX,
                        y: parallaxY,
                      }
                }
                transition={
                  prefersReduced
                    ? { duration: 0.3, x: { type: 'spring', stiffness: 50 }, y: { type: 'spring', stiffness: 50 } }
                    : {
                        opacity: { duration: 0.6, delay: i * 0.08 },
                        scale: { duration: pos.speed, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 },
                        x: { type: 'spring', stiffness: 50, damping: 20 },
                        y: { type: 'spring', stiffness: 50, damping: 20 },
                      }
                }
              >
                <img
                  src={item.image}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </motion.div>
            </Link>
          );
        })}
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="flex justify-center mb-6">
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <Monogram className="w-16 h-16 text-2xl rounded-2xl" />
            </motion.div>
          </div>

          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-muted-foreground mb-2">
            Discover
          </p>
          <p className="text-2xl sm:text-3xl font-extrabold mb-8">
            <span className="bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
              {settings.siteName}
            </span>
          </p>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground mb-6">
            Everything You Need.
            <br />
            <span className="bg-gradient-to-r from-brand to-brand-dark bg-clip-text text-transparent">
              All in One Marketplace.
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Shop products from many trusted vendors — with AI-powered discovery that finds exactly what you're looking for.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.button
              onClick={scrollToProducts}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-brand to-brand-dark hover:from-brand-dark hover:to-brand text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-primary/25"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Sparkles className="w-5 h-5" />
              Explore Products
            </motion.button>
            <motion.button
              onClick={scrollToCategories}
              className="inline-flex items-center gap-2 px-8 py-4 border border-border bg-background/60 hover:bg-muted text-foreground font-semibold rounded-xl transition-all duration-300"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Shop by Category
            </motion.button>
          </div>

          {/* Stats */}
          <motion.div
            className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={`backdrop-blur border rounded-xl p-6 transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lg ${
                  i === 0
                    ? 'col-span-2 sm:col-span-2 bg-gradient-to-br from-brand/10 via-background/70 to-brand/5 border-brand/30 hover:border-brand/60'
                    : 'col-span-1 bg-background/70 border-border hover:border-primary/50'
                }`}
              >
                <stat.icon aria-hidden="true" className="w-5 h-5 text-brand mx-auto mb-2" />
                <div className="text-2xl sm:text-3xl font-bold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
