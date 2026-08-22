import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Star, StarHalf, Minus, Plus, Store, ArrowLeft, MessageSquare, Zap, ShoppingCart, Sparkles, Loader2, X, Scale } from 'lucide-react';
import type { ProductVariant } from '../types';
import { supabase } from '../lib/supabaseClient';
import { useProduct, useNewArrivals } from '../hooks/useProducts';
import { ProductCard } from '../components/ProductCard';
import { WishlistButton } from '../components/WishlistButton';
import { Button } from '../components/ui/button';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { useCart } from '../context/CartContext';
import { VariantSelector } from '../components/product/VariantSelector';
import { ProductGallery } from '../components/product/ProductGallery';
import { toast } from 'sonner';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { product, loading, error } = useProduct(id || '');
  const { products: relatedProducts } = useNewArrivals();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);

  useEffect(() => {
    if (id) {
      fetchApprovedReviews(id);
    }
    setQuantity(1);
    setSelectedImage(0);
    setSelectedAttributes({});
  }, [id]);

  const fetchApprovedReviews = async (productId: string) => {
    try {
      const { data } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at, profiles(full_name)')
        .eq('product_id', productId)
        .eq('is_approved', true)
        .eq('is_hidden', false)
        .order('created_at', { ascending: false });
      setReviews(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleExplain = async () => {
    if (!product) return;
    setExplaining(true);
    setExplanation(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'explain_product',
          data: { productId: product.id },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Explanation failed');

      setExplanation(data.data.explanation);
    } catch (err: any) {
      toast.error('AI explanation unavailable. Try again later.');
    } finally {
      setExplaining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground text-xl mb-4">Product not found</p>
          <Link to="/">
            <Button>Back to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
    }).format(price);
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    for (let i = 0; i < fullStars; i++) {
      stars.push(<Star key={i} className="w-5 h-5 fill-yellow-400 text-warning" />);
    }
    if (hasHalfStar) {
      stars.push(<StarHalf key="half" className="w-5 h-5 fill-yellow-400 text-warning" />);
    }
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<Star key={`empty-${i}`} className="w-5 h-5 text-muted-foreground" />);
    }

    return stars;
  };

  const relatedProductsFiltered = relatedProducts
    .filter(p => p.category_id === product.category_id && p.id !== product.id)
    .slice(0, 4);

  // Variant selection
  const hasVariants = !!product.variants && !!product.variants.options && product.variants.options.length > 0;
  const variantOptionsComplete = !hasVariants || (product.variants!.options && product.variants!.options.every(
    (option) => selectedAttributes[option.name]
  ));
  const selectedVariant = hasVariants && variantOptionsComplete
    ? product.variants!.combinations.find((combination) =>
        Object.entries(selectedAttributes).every(
          ([key, val]) => combination.attributes[key] === val
        )
      )
    : undefined;
  const selectionReady = !hasVariants || !!selectedVariant;
  const effectivePrice = selectedVariant?.price ?? product.price;
  // For variant products, stock lives on the selected combination. Until a
  // combination is selected we do NOT fall back to the base stock_quantity,
  // because variant products keep their base stock at 0.
  const effectiveStock = hasVariants
    ? (selectedVariant ? selectedVariant.stock : null)
    : product.stock_quantity;
  const isOutOfStock = selectionReady ? effectiveStock === 0 : false;

  // Color-driven gallery resolution
  const selectedColor =
    selectedAttributes.color ??
    selectedAttributes.Color ??
    selectedAttributes.colour ??
    selectedVariant?.attributes?.color ??
    selectedVariant?.attributes?.Color ??
    selectedVariant?.attributes?.colour;
  const selectedSize =
    selectedAttributes.size ??
    selectedAttributes.Size ??
    selectedAttributes.sizes ??
    selectedVariant?.attributes?.size ??
    selectedVariant?.attributes?.Size;

  const combinationColor = (combination: ProductVariant) =>
    combination.attributes.color ?? combination.attributes.Color ?? combination.attributes.colour;
  const combinationSize = (combination: ProductVariant) =>
    combination.attributes.size ?? combination.attributes.Size ?? combination.attributes.sizes;

  const colorCombinations = hasVariants && selectedColor
    ? product.variants!.combinations.filter((combination) => combinationColor(combination) === selectedColor)
    : [];
  const selectedCombination = colorCombinations.find((combination) => combinationSize(combination) === selectedSize);

  const combinationImages = (combination: ProductVariant | undefined): string[] | null => {
    if (!combination) return null;
    if (combination.images && combination.images.length > 0) return combination.images;
    if (combination.image) return [combination.image];
    return null;
  };

  const galleryImages =
    combinationImages(selectedCombination) ??
    combinationImages(colorCombinations.find((c) => (c.images && c.images.length > 0) || !!c.image)) ??
    product.images;

  const handleBuyNow = async () => {
    if (isOutOfStock) { toast.error('Out of stock'); return; }
    if (hasVariants && !selectedVariant) {
      toast.error('Please select all options');
      return;
    }
    const qty = hasVariants ? Math.min(quantity, selectedVariant!.stock) : Math.min(quantity, product.stock_quantity || quantity);
    await addToCart(
      product.id,
      qty,
      selectedVariant?.id,
      selectedVariant?.attributes,
      selectedVariant?.price ?? undefined,
      product
    );
    navigate('/checkout');
  };

  const handleAddToCart = async () => {
    if (hasVariants && !selectedVariant) {
      toast.error('Please select all options');
      return;
    }
    const qty = hasVariants ? Math.min(quantity, selectedVariant!.stock) : Math.min(quantity, product.stock_quantity || quantity);
    await addToCart(
      product.id,
      qty,
      selectedVariant?.id,
      selectedVariant?.attributes,
      selectedVariant?.price ?? undefined,
      product
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Products
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Image Gallery */}
          <ProductGallery
            images={galleryImages}
            productName={product.name}
            activeIndex={selectedImage}
            onIndexChange={setSelectedImage}
            variantLabel={selectedColor}
            categorySlug={product.category?.slug}
          />

          {/* Product Info */}
          <div>
            <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
            
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1">
                {renderStars(product.rating)}
              </div>
              <span className="text-muted-foreground">({product.rating} rating)</span>
            </div>

            <div className="flex items-baseline gap-4 mb-6">
              <span className="text-3xl font-bold text-primary">
                {formatPrice(effectivePrice)}
              </span>
              {product.compare_price && product.compare_price > product.price && (
                <span className="text-xl text-muted-foreground line-through">
                  {formatPrice(product.compare_price)}
                </span>
              )}
            </div>

            <p className="text-secondary-foreground mb-6 leading-relaxed">
              {product.description}
            </p>

            {/* AI Explain This Product */}
            <div className="mb-6">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExplain}
                disabled={explaining}
                className="gap-2"
              >
                {explaining ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-primary" />
                )}
                {explaining ? 'Explaining...' : 'Explain This Product with AI'}
              </Button>
              {explanation && (
                <div className="mt-3 bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm text-secondary-foreground">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                      <Sparkles aria-hidden="true" className="w-3 h-3" />
                      AI Explanation
                    </span>
                    <button onClick={() => setExplanation(null)} aria-label="Dismiss explanation">
                      <X aria-hidden="true" className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                  <p className="whitespace-pre-line">{explanation}</p>
                </div>
              )}
            </div>

            {/* Variant Selector */}
            {hasVariants && (
              <VariantSelector
                variants={product.variants!}
                selectedAttributes={selectedAttributes}
                onSelect={(attributes) => {
                  setSelectedAttributes(attributes);
                  setSelectedImage(0);
                  // Clamp the quantity to the newly selected combination's
                  // available stock so stale quantities can never exceed it.
                  const combo = product.variants!.combinations.find((combination) =>
                    Object.entries(attributes).every(
                      ([key, val]) => combination.attributes[key] === val
                    )
                  );
                  if (combo) {
                    setQuantity((q) => Math.min(q, Math.max(1, combo.stock)));
                  }
                }}
              />
            )}

            {/* Vendor Info */}
            {product.vendor && (
              <div className="bg-card rounded-lg p-4 mb-6 border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-brand to-brand-dark rounded-lg flex items-center justify-center">
                    <Store className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">{product.vendor.store_name}</p>
                    <p className="text-muted-foreground text-sm">Verified Vendor</p>
                  </div>
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            <div className="flex items-center gap-4 mb-6">
              <span className="text-secondary-foreground">Quantity:</span>
              <div className="flex items-center gap-2 bg-card rounded-lg border border-border">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  aria-label="Decrease quantity"
                  className="p-2 hover:bg-muted transition-colors"
                  disabled={quantity <= 1}
                >
                  <Minus aria-hidden="true" className="w-4 h-4" />
                </button>
                <span className="w-12 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(Math.min(effectiveStock ?? 0, quantity + 1))}
                  aria-label="Increase quantity"
                  className="p-2 hover:bg-muted transition-colors"
                  disabled={!selectionReady || quantity >= (effectiveStock ?? 0)}
                >
                  <Plus aria-hidden="true" className="w-4 h-4" />
                </button>
              </div>
              <span className="text-muted-foreground text-sm">
                {!selectionReady
                  ? 'Select options to see availability'
                  : isOutOfStock
                    ? 'Out of stock'
                    : `${effectiveStock ?? 0} available`}
              </span>
            </div>

            {/* Wishlist & Add to Cart */}
            <div className="flex items-center gap-3 flex-wrap">
              <WishlistButton productId={product.id} variant="default" />
              <Button
                variant="default"
                size="lg"
                onClick={handleBuyNow}
                disabled={!selectionReady || isOutOfStock}
                className="flex-1 py-4 text-lg gap-2"
              >
                <Zap className="w-5 h-5" />
                {hasVariants && !selectedVariant ? 'Select Options' : 'Buy Now'}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={handleAddToCart}
                disabled={!selectionReady || isOutOfStock}
                className="flex-1 py-4 text-lg gap-2"
              >
                <ShoppingCart className="w-5 h-5" />
                {hasVariants && !selectedVariant ? 'Select Options' : 'Add to Cart'}
              </Button>
            </div>

            {/* Category */}
            {product.category && (
              <div className="mt-6">
                <span className="text-muted-foreground">Category: </span>
                  <span className="text-foreground">{product.category.name}</span>
              </div>
            )}

            {/* Compare link */}
            <Link
              to={`/compare?ids=${encodeURIComponent(product.id)}`}
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-primary hover:underline"
            >
              <Scale className="w-4 h-4" />
              Compare this product with others
            </Link>
          </div>
        </div>

        {/* Related Products */}
        {relatedProductsFiltered.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-6">Related Products</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {relatedProductsFiltered.map((relatedProduct) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} />
              ))}
            </div>
          </div>
        )}

        {/* Reviews Section */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Customer Reviews ({reviews.length})</h2>
          {reviewsLoading ? (
            <div className="text-center py-8"><div className="h-8 w-8 animate-spin border-4 border-primary border-t-transparent rounded-full mx-auto" /></div>
          ) : reviews.length === 0 ? (
            <div className="bg-card rounded-lg p-8 border border-border text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No approved reviews yet. Be the first to review this product!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reviews.map((r) => (
                <div key={r.id} className="bg-card rounded-lg p-6 border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-brand to-brand-dark rounded-full flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{r.profiles?.full_name || 'Anonymous'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star key={star} className={`w-4 h-4 ${star <= r.rating ? 'fill-yellow-400 text-warning' : 'text-muted-foreground'}`} />
                      ))}
                    </div>
                  </div>
                  <p className="text-secondary-foreground">{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
