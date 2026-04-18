import { getRequestConfig } from 'next-intl/server'
import { cookies, headers } from 'next/headers'

const SUPPORTED_LOCALES = ['en', 'de'] as const
type Locale = typeof SUPPORTED_LOCALES[number]

const DEFAULT_LOCALE: Locale = 'en'

function resolveLocale(cookieLocale: string | undefined, acceptLanguage: string): Locale {
  if (cookieLocale && (SUPPORTED_LOCALES as readonly string[]).includes(cookieLocale)) {
    return cookieLocale as Locale
  }
  return acceptLanguage.toLowerCase().startsWith('de') ? 'de' : DEFAULT_LOCALE
}

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])

  const cookieLocale = cookieStore.get('locale')?.value
  const acceptLanguage = headerStore.get('accept-language') ?? ''
  const locale = resolveLocale(cookieLocale, acceptLanguage)

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
