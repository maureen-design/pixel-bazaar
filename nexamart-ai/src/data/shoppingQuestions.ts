export interface QuestionOption {
  label: string;
  value: string;
}

export interface Question {
  id: string;
  label: string;
  type: 'select' | 'radio' | 'checkbox' | 'range';
  options?: QuestionOption[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface CategoryConfig {
  slug: string;
  label: string;
  icon: string;
  questions: Question[];
}

export const categoryConfigs: CategoryConfig[] = [
  {
    slug: 'electronics',
    label: 'Electronics',
    icon: 'smartphone',
    questions: [
      {
        id: 'useCase',
        label: "What will you use this for?",
        type: 'select',
        options: [
          { label: 'Programming / Coding', value: 'programming' },
          { label: 'Gaming', value: 'gaming' },
          { label: 'Office Work / Productivity', value: 'office' },
          { label: 'Graphic Design / Creative', value: 'creative' },
          { label: 'General Use', value: 'general' },
          { label: 'Student / School', value: 'student' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 300000,
        step: 5000,
        placeholder: 'KES 0 - KES 300,000',
      },
      {
        id: 'priorities',
        label: "What's most important to you?",
        type: 'checkbox',
        options: [
          { label: 'Performance', value: 'performance' },
          { label: 'Battery Life', value: 'battery' },
          { label: 'Portability', value: 'portability' },
          { label: 'Screen Quality', value: 'screen' },
          { label: 'Price', value: 'price' },
        ],
      },
      {
        id: 'experience',
        label: "What's your experience level?",
        type: 'radio',
        options: [
          { label: 'Beginner', value: 'beginner' },
          { label: 'Intermediate', value: 'intermediate' },
          { label: 'Expert', value: 'expert' },
        ],
      },
    ],
  },
  {
    slug: 'fashion',
    label: 'Fashion',
    icon: 'shirt',
    questions: [
      {
        id: 'occasion',
        label: "What's the occasion?",
        type: 'select',
        options: [
          { label: 'Casual / Everyday', value: 'casual' },
          { label: 'Formal / Work', value: 'formal' },
          { label: 'Sport / Activewear', value: 'sport' },
          { label: 'Party / Evening', value: 'party' },
        ],
      },
      {
        id: 'style',
        label: "What's your preferred style?",
        type: 'select',
        options: [
          { label: 'Modern', value: 'modern' },
          { label: 'Classic', value: 'classic' },
          { label: 'Minimalist', value: 'minimalist' },
          { label: 'Trendy', value: 'trendy' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 50000,
        step: 1000,
        placeholder: 'KES 0 - KES 50,000',
      },
    ],
  },
  {
    slug: 'home-living',
    label: 'Home & Living',
    icon: 'sofa',
    questions: [
      {
        id: 'room',
        label: 'What room is this for?',
        type: 'select',
        options: [
          { label: 'Living Room', value: 'living-room' },
          { label: 'Bedroom', value: 'bedroom' },
          { label: 'Kitchen', value: 'kitchen' },
          { label: 'Office / Study', value: 'office' },
          { label: 'Outdoor', value: 'outdoor' },
        ],
      },
      {
        id: 'style',
        label: "What's your preferred style?",
        type: 'select',
        options: [
          { label: 'Modern', value: 'modern' },
          { label: 'Rustic', value: 'rustic' },
          { label: 'Minimalist', value: 'minimalist' },
          { label: 'Industrial', value: 'industrial' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 100000,
        step: 5000,
        placeholder: 'KES 0 - KES 100,000',
      },
    ],
  },
  {
    slug: 'books',
    label: 'Books',
    icon: 'book-open',
    questions: [
      {
        id: 'genre',
        label: 'What genre are you into?',
        type: 'select',
        options: [
          { label: 'Self-Development', value: 'self-help' },
          { label: 'Fiction', value: 'fiction' },
          { label: 'Business / Strategy', value: 'business' },
          { label: "Children's Books", value: 'children' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 20000,
        step: 500,
        placeholder: 'KES 0 - KES 20,000',
      },
    ],
  },
  {
    slug: 'beauty',
    label: 'Beauty',
    icon: 'sparkles',
    questions: [
      {
        id: 'productType',
        label: 'What kind of product?',
        type: 'select',
        options: [
          { label: 'Skincare', value: 'skincare' },
          { label: 'Makeup', value: 'makeup' },
          { label: 'Fragrance', value: 'fragrance' },
          { label: 'Hair Care', value: 'hair-care' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 50000,
        step: 1000,
        placeholder: 'KES 0 - KES 50,000',
      },
    ],
  },
  {
    slug: 'sports',
    label: 'Sports & Fitness',
    icon: 'dumbbell',
    questions: [
      {
        id: 'activity',
        label: 'What activity is this for?',
        type: 'select',
        options: [
          { label: 'Gym / Strength Training', value: 'gym' },
          { label: 'Running', value: 'running' },
          { label: 'Football', value: 'football' },
          { label: 'Basketball', value: 'basketball' },
          { label: 'Yoga / Flexibility', value: 'yoga' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 50000,
        step: 1000,
        placeholder: 'KES 0 - KES 50,000',
      },
    ],
  },
  {
    slug: 'toys',
    label: 'Toys',
    icon: 'toy-brick',
    questions: [
      {
        id: 'ageRange',
        label: "Who's it for?",
        type: 'select',
        options: [
          { label: 'Kids 3-6', value: 'kids-3-6' },
          { label: 'Kids 7-12', value: 'kids-7-12' },
          { label: 'Teens', value: 'teens' },
          { label: 'All Ages', value: 'all-ages' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 20000,
        step: 500,
        placeholder: 'KES 0 - KES 20,000',
      },
    ],
  },
  {
    slug: 'automotive',
    label: 'Automotive',
    icon: 'car',
    questions: [
      {
        id: 'purpose',
        label: 'What do you need?',
        type: 'select',
        options: [
          { label: 'Maintenance / Repairs', value: 'maintenance' },
          { label: 'Accessories', value: 'accessories' },
          { label: 'Car Tech', value: 'car-tech' },
          { label: 'Interior', value: 'interior' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 50000,
        step: 1000,
        placeholder: 'KES 0 - KES 50,000',
      },
    ],
  },
  {
    slug: 'digital-products',
    label: 'Digital Products',
    icon: 'cpu',
    questions: [
      {
        id: 'type',
        label: 'What type of digital product?',
        type: 'select',
        options: [
          { label: 'UI / Design Kit', value: 'design-kit' },
          { label: 'E-book', value: 'ebook' },
          { label: 'Online Course', value: 'course' },
          { label: 'Template', value: 'template' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 50000,
        step: 1000,
        placeholder: 'KES 0 - KES 50,000',
      },
    ],
  },
  {
    slug: 'local-handmade',
    label: 'Local Handmade',
    icon: 'hammer',
    questions: [
      {
        id: 'purpose',
        label: 'What are you looking for?',
        type: 'select',
        options: [
          { label: 'Jewelry', value: 'jewelry' },
          { label: 'Home Decor', value: 'home-decor' },
          { label: 'Art & Carvings', value: 'art' },
          { label: 'Baskets & Textiles', value: 'textiles' },
        ],
      },
      {
        id: 'budget',
        label: "What's your budget?",
        type: 'range',
        min: 0,
        max: 50000,
        step: 1000,
        placeholder: 'KES 0 - KES 50,000',
      },
    ],
  },
];

export const FALLBACK_QUESTIONS: Question[] = [
  {
    id: 'useCase',
    label: 'What will you use it for?',
    type: 'select',
    options: [
      { label: 'Gifting', value: 'gifting' },
      { label: 'Personal Use', value: 'personal' },
      { label: 'Business', value: 'business' },
    ],
  },
  {
    id: 'budget',
    label: "What's your budget?",
    type: 'range',
    min: 0,
    max: 100000,
    step: 5000,
    placeholder: 'KES 0 - KES 100,000',
  },
];

export function getCategoryConfig(slug?: string): CategoryConfig | null {
  if (!slug) return null;
  return categoryConfigs.find((c) => c.slug === slug) || null;
}
