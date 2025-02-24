'use client'

import posthog from 'posthog-js'
import { PostHogProvider as Provider } from 'posthog-js/react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { Suspense } from 'react'

// Separate component for page view tracking to handle suspense
function PageViewTracker() {
  // const pathname = usePathname()
  // const searchParams = useSearchParams()

  // useEffect(() => {
  //   if (pathname) {
  //     let url = window.origin + pathname
  //     if (searchParams.toString()) {
  //       url = url + `?${searchParams.toString()}`
  //     }
  //     posthog.capture('$pageview', {
  //       $current_url: url,
  //     })
  //   }
  // }, [pathname, searchParams])

  return null
}

export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // useEffect(() => {
  //   if (typeof window !== 'undefined') {
  //     const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY
  //     if (!posthogKey) {
  //       console.warn('posthog: missing NEXT_PUBLIC_POSTHOG_API_KEY')
  //       return
  //     }

  //     posthog.init(posthogKey, {
  //       api_host: 'https://app.posthog.com',
  //       capture_pageview: false,
  //       bootstrap: {
  //         distinctID: process.env.NODE_ENV,
  //       },
  //       debug: false,
  //     })
  //   }
  // }, [])

  // For now, just render children without PostHog tracking
  return children

  // return (
  //   <Provider client={posthog}>
  //     <Suspense>
  //       <PageViewTracker />
  //     </Suspense>
  //     {children}
  //   </Provider>
  // )
} 