import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name is too long'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export const contactFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  subject: z.string().min(1, 'Please select a subject'),
  orderNumber: z.string().optional(),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000, 'Message is too long'),
});

export const vendorApplicationSchema = z.object({
  business_name: z.string().min(2, 'Business name must be at least 2 characters').max(100, 'Business name is too long'),
  business_description: z.string().min(20, 'Description must be at least 20 characters').max(1000, 'Description is too long'),
  phone: z.string().min(10, 'Please enter a valid phone number').regex(/^\+?[\d\s-]+$/, 'Invalid phone number format'),
  city: z.string().min(2, 'City is required'),
  main_categories: z.array(z.string()).min(1, 'Select at least one product category'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;
export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
export type ContactFormData = z.infer<typeof contactFormSchema>;
export type VendorApplicationFormData = z.infer<typeof vendorApplicationSchema>;
