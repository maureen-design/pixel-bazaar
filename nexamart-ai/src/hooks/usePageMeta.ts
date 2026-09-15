import { useEffect } from 'react';
import { useSettings } from './useSettings';

interface PageMeta {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
}

export function usePageMeta(meta: PageMeta = {}) {
  const { settings } = useSettings();

  useEffect(() => {
    const siteName = settings.siteName || 'NexaMart AI';
    const title = meta.title ? `${meta.title} | ${siteName}` : siteName;
    const description = meta.description || settings.siteDescription || '';

    document.title = title;

    const updateMeta = (name: string, content: string) => {
      let element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute('name', name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    const updateProperty = (property: string, content: string) => {
      let element = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute('property', property);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    if (description) updateMeta('description', description);
    if (meta.title) updateProperty('og:title', title);
    if (description) updateProperty('og:description', description);
    if (meta.image) updateProperty('og:image', meta.image);
    if (meta.url) updateProperty('og:url', meta.url);

    updateMeta('twitter:card', meta.image ? 'summary_large_image' : 'summary');
    if (meta.title) updateProperty('twitter:title', title);
    if (description) updateProperty('twitter:description', description);
    if (meta.image) updateProperty('twitter:image', meta.image);
  }, [meta.title, meta.description, meta.image, meta.url, settings.siteName, settings.siteDescription]);
}
