import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Yakeen API Batch Tester',
  description: 'Test batch API calls to YakeenService',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
