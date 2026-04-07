import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'KRAB Framework',
  description: 'An open framework for evaluating Confidential Computing deployments',
  cleanUrls: true,

  head: [
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap', rel: 'stylesheet' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'KRAB Framework',

    nav: [
      { text: 'Framework', link: '/' },
      { text: 'Platform Baselines', link: '/baselines' },
    ],

    sidebar: [
      {
        text: 'KRAB Framework',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Platform Baselines', link: '/baselines' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vkobel/krab-framework' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      copyright: 'KRAB Framework — MIT License'
    }
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'one-dark-pro'
    }
  }
})
