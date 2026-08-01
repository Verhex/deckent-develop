import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import './custom.css';

export default {
  extends: DefaultTheme,
  // Add custom components here if needed
  // Layout: MyLayout,
  // enhanceApp({ app, router, siteData }) {
  //   app.component('MyComponent', MyComponent)
  // }
} satisfies Theme;
