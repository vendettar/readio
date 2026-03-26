import { Check, Eye, EyeOff, Loader2, X } from 'lucide-react'
import { memo, useEffect, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { checkCorsProxyHealth } from '@/lib/fetchUtils'
import type { SettingsFormValues } from '@/lib/schemas/settings'
import { Button } from '../../ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../ui/form'
import { Input } from '../../ui/input'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface CorsProxySettingsSectionProps {
  form: UseFormReturn<SettingsFormValues>
  onFieldBlur: () => Promise<void>
}

const VERIFY_STATUS = {
  IDLE: 'idle',
  VERIFYING: 'verifying',
  SUCCESS: 'success',
  FAIL: 'fail',
} as const

type VerifyStatus = (typeof VERIFY_STATUS)[keyof typeof VERIFY_STATUS]

const RESET_DELAY_MS = 3000

export const CorsProxySettingsSection = memo(function CorsProxySettingsSection({
  form,
  onFieldBlur,
}: CorsProxySettingsSectionProps) {
  const { t } = useTranslation()
  const [showKey, setShowKey] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>(VERIFY_STATUS.IDLE)
  const resetVerifyStatus = () => {
    if (verifyStatus !== VERIFY_STATUS.IDLE) {
      setVerifyStatus(VERIFY_STATUS.IDLE)
    }
  }

  // Automatically reset verify status back to idle after a delay
  useEffect(() => {
    if (verifyStatus === VERIFY_STATUS.SUCCESS || verifyStatus === VERIFY_STATUS.FAIL) {
      const timer = setTimeout(() => {
        setVerifyStatus(VERIFY_STATUS.IDLE)
      }, RESET_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [verifyStatus])

  const handleVerify = async () => {
    if (verifyStatus !== VERIFY_STATUS.IDLE) return

    const isValid = await form.trigger(['proxyUrl'])
    if (!isValid) return

    const values = form.getValues()
    setVerifyStatus(VERIFY_STATUS.VERIFYING)
    try {
      const result = await checkCorsProxyHealth({
        proxyConfig: {
          proxyUrl: values.proxyUrl,
          authHeader: values.proxyAuthHeader,
          authValue: values.proxyAuthValue,
        },
      })
      setVerifyStatus(result.ok ? VERIFY_STATUS.SUCCESS : VERIFY_STATUS.FAIL)
    } catch {
      setVerifyStatus(VERIFY_STATUS.FAIL)
    }
  }

  return (
    <SettingsSectionCard title={t('settingsCorsProxy')} description={t('settingsCorsProxyDesc')}>
      <Form {...form}>
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="proxyUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('proxyUrlLabel')}</FormLabel>
                <div className="flex max-w-md items-center gap-2">
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t('proxyUrlPlaceholder')}
                      className="flex-1"
                      {...field}
                      onChange={(event) => {
                        field.onChange(event)
                        resetVerifyStatus()
                      }}
                      onBlur={() => {
                        field.onBlur()
                        void onFieldBlur()
                      }}
                    />
                  </FormControl>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={verifyStatus === VERIFY_STATUS.VERIFYING || !field.value?.trim()}
                    onClick={handleVerify}
                    className={`min-w-20 transition-all ${
                      verifyStatus === VERIFY_STATUS.SUCCESS
                        ? 'border-green-500/50 bg-green-50/50 dark:bg-green-500/10'
                        : verifyStatus === VERIFY_STATUS.FAIL
                          ? 'border-red-500/50 bg-red-50/50 dark:bg-red-500/10'
                          : ''
                    }`}
                    aria-label={t('settingsVerify')}
                  >
                    {verifyStatus === VERIFY_STATUS.VERIFYING ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : verifyStatus === VERIFY_STATUS.SUCCESS ? (
                      <Check className="h-5 w-5 text-green-600" strokeWidth={3} />
                    ) : verifyStatus === VERIFY_STATUS.FAIL ? (
                      <X className="h-5 w-5 text-red-600" strokeWidth={3} />
                    ) : (
                      t('settingsVerify')
                    )}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid max-w-md grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="proxyAuthHeader"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('proxyAuthHeaderLabel')}</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder={t('proxyAuthHeaderPlaceholder')}
                      {...field}
                      onChange={(event) => {
                        field.onChange(event)
                        resetVerifyStatus()
                      }}
                      onBlur={() => {
                        field.onBlur()
                        void onFieldBlur()
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proxyAuthValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('proxyAuthValueLabel')}</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input
                        type={showKey ? 'text' : 'password'}
                        placeholder={t('proxyAuthValuePlaceholder')}
                        className="flex-1"
                        {...field}
                        onChange={(event) => {
                          field.onChange(event)
                          resetVerifyStatus()
                        }}
                        onBlur={() => {
                          field.onBlur()
                          void onFieldBlur()
                        }}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      disabled={!field.value?.trim()}
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={t('settingsShowHideProxyAuth')}
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>
      </Form>
    </SettingsSectionCard>
  )
})
