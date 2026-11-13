import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Loader2, Sparkles, RotateCcw, Check } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { invokeAIAssistant, isGuestAILimitError } from '../../lib/aiAssistantClient';
import { useCategories } from '../../hooks/useCategories';
import { CategoryIcon } from '../../utils/categoryIcons';
import { ProductRecommendationCard, type Recommendation } from './ProductRecommendationCard';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { getCategoryConfig, FALLBACK_QUESTIONS, type Question } from '../../data/shoppingQuestions';

interface ShoppingAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategoryId?: string | null;
}

interface Answers {
  categoryId: string | null;
  categorySlug: string | null;
  values: Record<string, string | string[] | number>;
}

type Step = 'category' | 'question' | 'loading' | 'results';

export function ShoppingAssistantModal({ open, onOpenChange, initialCategoryId }: ShoppingAssistantModalProps) {
  const navigate = useNavigate();
  const { categories } = useCategories();

  const [step, setStep] = useState<Step>('category');
  const [answers, setAnswers] = useState<Answers>({
    categoryId: initialCategoryId || null,
    categorySlug: null,
    values: {},
  });
  const [questionIndex, setQuestionIndex] = useState(0);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [summary, setSummary] = useState('');

  const reset = () => {
    setStep('category');
    setAnswers({ categoryId: initialCategoryId || null, categorySlug: null, values: {} });
    setQuestionIndex(0);
    setRecommendations([]);
    setSummary('');
  };

  useEffect(() => {
    if (open && initialCategoryId) {
      const cat = categories.find((c) => c.id === initialCategoryId);
      setAnswers({ categoryId: initialCategoryId, categorySlug: cat?.slug || null, values: {} });
      setStep('category');
    }
  }, [open, initialCategoryId, categories]);

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setTimeout(reset, 200);
    }
  };

  const selectedCategory = categories.find((c) => c.id === answers.categoryId);
  const config = getCategoryConfig(selectedCategory?.slug || answers.categorySlug || undefined);
  const questions: Question[] = config?.questions || FALLBACK_QUESTIONS;

  const selectCategory = (category: { id: string; slug: string } | null) => {
    const cat = category ? categories.find((c) => c.id === category.id) : null;
    setAnswers((prev) => ({
      ...prev,
      categoryId: category?.id || null,
      categorySlug: cat?.slug || null,
    }));
    setQuestionIndex(0);
    setStep('question');
  };

  const currentQuestion = questions[questionIndex];

  const answerValue = currentQuestion ? (answers.values[currentQuestion.id] ?? '') : '';
  const canContinue = currentQuestion
    ? Array.isArray(answerValue)
      ? answerValue.length > 0
      : typeof answerValue === 'number'
        ? true
        : answerValue !== ''
    : false;

  const setValue = (value: string | string[] | number) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      values: { ...prev.values, [currentQuestion.id]: value },
    }));
  };

  const toggleCheckbox = (optionValue: string) => {
    if (!currentQuestion) return;
    const current = Array.isArray(answers.values[currentQuestion.id]) ? (answers.values[currentQuestion.id] as string[]) : [];
    const next = current.includes(optionValue)
      ? current.filter((v) => v !== optionValue)
      : [...current, optionValue];
    setAnswers((prev) => ({
      ...prev,
      values: { ...prev.values, [currentQuestion.id]: next },
    }));
  };

  const goNext = () => {
    if (questionIndex < questions.length - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      setStep('loading');
      runAssistant();
    }
  };

  const goBack = () => {
    if (step === 'question' && questionIndex > 0) {
      setQuestionIndex(questionIndex - 1);
    } else if (step === 'question') {
      setStep('category');
    } else if (step === 'results') {
      setStep('question');
      setQuestionIndex(questions.length - 1);
    }
  };

  const runAssistant = async () => {
    setRecommendations([]);
    setSummary('');
    try {
      const budget = answers.values['budget'];
      const priorities = answers.values['priorities'];
      const experience = answers.values['experience'];

      const { data, error } = await invokeAIAssistant('shopping_assistant', {
            category: answers.categoryId,
            useCase:
              typeof answers.values['useCase'] === 'string'
                ? answers.values['useCase']
                : typeof answers.values['occasion'] === 'string'
                  ? answers.values['occasion']
                  : typeof answers.values['room'] === 'string'
                    ? answers.values['room']
                    : typeof answers.values['activity'] === 'string'
                      ? answers.values['activity']
                      : typeof answers.values['purpose'] === 'string'
                        ? answers.values['purpose']
                        : typeof answers.values['type'] === 'string'
                          ? answers.values['type']
                          : typeof answers.values['genre'] === 'string'
                            ? answers.values['genre']
                            : typeof answers.values['productType'] === 'string'
                              ? answers.values['productType']
                              : typeof answers.values['ageRange'] === 'string'
                                ? answers.values['ageRange']
                                : typeof answers.values['style'] === 'string'
                                  ? answers.values['style']
                                  : 'General',
            budgetMin: typeof budget === 'number' && budget > 0 ? 0 : null,
            budgetMax: typeof budget === 'number' && budget > 0 ? budget : null,
            priorities: Array.isArray(priorities) ? priorities.join(', ') : typeof priorities === 'string' ? priorities : '',
            experienceLevel: typeof experience === 'string' ? experience : '',
          });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'AI assistant failed');

      setRecommendations(data.data.recommendations || []);
      setSummary(data.data.summary || '');
      setStep('results');
    } catch (err: any) {
      if (!isGuestAILimitError(err)) toast.error('Nexa is unavailable right now. Try again later.');
      setStep('question');
    }
  };

  const startOver = () => {
    setAnswers((prev) => ({ categoryId: prev.categoryId, categorySlug: prev.categorySlug, values: {} }));
    setQuestionIndex(0);
    setStep('category');
  };

  const totalSteps = questions.length;
  const stepIndex = step === 'category' ? 0 : step === 'question' ? questionIndex + 1 : totalSteps + 1;
  const progress = step === 'results' ? 100 : (stepIndex / (totalSteps + 1)) * 100;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Nexa</h2>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-brand to-brand-dark transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {step === 'category' && (
            <div>
              <p className="text-3xl font-bold mb-1">What are you shopping for?</p>
              <p className="text-muted-foreground mb-4">Pick a category and I'll find the perfect match for you.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  onClick={() => selectCategory(null)}
                  aria-pressed={answers.categoryId === null}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all"
                >
                  <CategoryIcon slug="package" className="w-6 h-6 text-muted-foreground" />
                  <span className="text-sm font-medium">Any Category</span>
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => selectCategory({ id: cat.id, slug: cat.slug })}
                    aria-pressed={answers.categoryId === cat.id}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-border hover:border-primary/50 hover:bg-muted/50 transition-all"
                  >
                    <CategoryIcon slug={cat.slug} className="w-6 h-6 text-primary" />
                    <span className="text-sm font-medium text-center">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'question' && currentQuestion && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Question {questionIndex + 1} of {totalSteps}
              </p>
              <p className="text-3xl font-bold mb-4">{currentQuestion.label}</p>

              {currentQuestion.type === 'select' && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={currentQuestion.label}>
                  {currentQuestion.options?.map((option) => {
                    const active = answerValue === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setValue(option.value)}
                        aria-pressed={active}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all flex items-center gap-2 ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        {option.label}
                        {active && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQuestion.type === 'radio' && (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={currentQuestion.label}>
                  {currentQuestion.options?.map((option) => {
                    const active = answerValue === option.value;
                    return (
                      <button
                        key={option.value}
                        onClick={() => setValue(option.value)}
                        role="radio"
                        aria-checked={active}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all flex items-center gap-2 ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-card text-foreground border-border hover:border-primary/50'
                        }`}
                      >
                        {option.label}
                        {active && <Check className="w-4 h-4" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentQuestion.type === 'checkbox' && (
                <div>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={currentQuestion.label}>
                    {currentQuestion.options?.map((option) => {
                      const active = Array.isArray(answerValue) && answerValue.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          onClick={() => toggleCheckbox(option.value)}
                          aria-pressed={active}
                          className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all flex items-center gap-2 ${
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-card text-foreground border-border hover:border-primary/50'
                          }`}
                        >
                          {option.label}
                          {active && <Check className="w-4 h-4" />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Select all that apply</p>
                </div>
              )}

              {currentQuestion.type === 'range' && (
                <div>
                  <p className="text-2xl font-bold text-primary mb-4">
                    {typeof answerValue === 'number' && answerValue > 0
                      ? `KES ${answerValue.toLocaleString()}`
                      : currentQuestion.placeholder || 'Any budget'}
                  </p>
                  <input
                    type="range"
                    aria-label={`${currentQuestion.label} (${currentQuestion.placeholder || 'any budget'})`}
                    min={currentQuestion.min ?? 0}
                    max={currentQuestion.max ?? 100000}
                    step={currentQuestion.step ?? 1000}
                    value={typeof answerValue === 'number' ? answerValue : (currentQuestion.min ?? 0)}
                    onChange={(e) => setValue(Number(e.target.value))}
                    className="w-full accent-[var(--brand)]"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>KES {(currentQuestion.min ?? 0).toLocaleString()}</span>
                    <span>KES {(currentQuestion.max ?? 100000).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'loading' && (
            <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 aria-hidden="true" className="w-10 h-10 text-primary animate-spin mb-4" />
              <p className="text-lg font-medium">Finding the best matches for you...</p>
              <p className="text-muted-foreground text-sm mt-1">Analyzing products across the store.</p>
            </div>
          )}

          {step === 'results' && (
            <div aria-live="polite">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    <Sparkles className="w-3 h-3" />
                    AI Recommendations
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={startOver}>
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Start Over
                </Button>
              </div>

              {summary && (
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-4 text-sm text-secondary-foreground">
                  {summary}
                </div>
              )}

              {recommendations.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-muted-foreground mb-4">No products matched your criteria.</p>
                  <Button variant="outline" onClick={startOver}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Try Different Options
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec, i) => (
                    <motion.div key={rec.product_id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                      <ProductRecommendationCard recommendation={rec} index={i} />
                    </motion.div>
                  ))}
                  <div className="pt-2 text-center">
                    <Button variant="outline" onClick={() => navigate('/')} className="w-full">
                      Browse All Products
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        {step === 'question' && (
          <div className="flex items-center justify-between pt-3 border-t border-border mt-3">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <span className="text-xs text-muted-foreground">
              Question {questionIndex + 1} of {totalSteps}
            </span>
            <Button size="sm" onClick={goNext} disabled={!canContinue}>
              {questionIndex === totalSteps - 1 ? 'Get Recommendations' : 'Continue'}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {step === 'results' && (
          <div className="flex items-center justify-between pt-3 border-t border-border mt-3">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <span className="text-xs text-muted-foreground">Recommendations ready</span>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
