import { useEffect } from 'react'
import { Compass } from 'lucide-react'

import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { env } from '@/lib/env'

export function NotFoundPage() {
  useEffect(() => {
    document.title = `Not found · ${env.siteName}`
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-4 py-20">
      <EmptyState
        icon={Compass}
        title="404 — nothing here"
        description="That page does not exist. It may have been renamed, or the link may be wrong."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <ButtonLink to="/">Go home</ButtonLink>
            <ButtonLink to="/levels" variant="secondary">
              Browse levels
            </ButtonLink>
          </div>
        }
      />
    </div>
  )
}
