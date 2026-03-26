import { Check, Eye, EyeOff, Loader2, X } from 'lucide-react'
import { memo, type PointerEvent, useEffect, useRef, useState } from 'react'
import { type UseFormReturn, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { type ASRProvider, getAsrProviderConfig, verifyAsrKey } from '@/lib/asr'
import { clearAsrVerification, markAsrVerificationSucceeded } from '@/lib/asr/readiness'
import {
  ASR_CONFIG_ERROR,
  getAsrModelsForProvider,
  isAsrModelSupportedForProvider,
  validateAsrProviderModelSelection,
} from '@/lib/asr/registry'
import { ASRClientError } from '@/lib/asr/types'
import { getEnabledAsrProviders, type SettingsFormValues } from '@/lib/schemas/settings'
import { Button } from '../../ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../ui/form'
import { Input } from '../../ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../../ui/select'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface AsrSettingsSectionProps {
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

const VERIFY_RESET_DELAY_MS = 2000
const CUSTOM_MODEL_OPTION_VALUE = '__custom_model__'
const SELECT_CLEAR_ICON_CLASS = 'h-2.5 w-2.5'

export const AsrSettingsSection = memo(function AsrSettingsSection({
  form,
  onFieldBlur,
}: AsrSettingsSectionProps) {
  const { t } = useTranslation()
  const [showKey, setShowKey] = useState(false)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>(VERIFY_STATUS.IDLE)

  const asrProvider = useWatch({ control: form.control, name: 'asrProvider' }) ?? ''
  const asrModel = useWatch({ control: form.control, name: 'asrModel' }) ?? ''
  const asrUseCustomModel = useWatch({ control: form.control, name: 'asrUseCustomModel' }) ?? false
  const asrCustomModelId = useWatch({ control: form.control, name: 'asrCustomModelId' }) ?? ''
  const apiKeyValue = useWatch({ control: form.control, name: 'asrKey' })
  const models = getAsrModelsForProvider(asrProvider)
  const enabledProviders = getEnabledAsrProviders()
  const hasSelectedProvider = enabledProviders.includes(asrProvider as ASRProvider)
  const providerDocsUrl = hasSelectedProvider
    ? getAsrProviderConfig(asrProvider as ASRProvider).docsUrl
    : null
  const asrVerificationSignature = [
    asrProvider.trim(),
    asrModel.trim(),
    asrUseCustomModel ? '1' : '0',
    asrCustomModelId.trim(),
    apiKeyValue?.trim() ?? '',
  ].join('|')
  const previousAsrVerificationSignatureRef = useRef<string | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset status on ASR config changes that invalidate prior verify state
  useEffect(() => {
    setVerifyStatus(VERIFY_STATUS.IDLE)
  }, [apiKeyValue, asrProvider, asrModel, asrUseCustomModel, asrCustomModelId])

  useEffect(() => {
    if (previousAsrVerificationSignatureRef.current === null) {
      previousAsrVerificationSignatureRef.current = asrVerificationSignature
      return
    }

    if (previousAsrVerificationSignatureRef.current !== asrVerificationSignature) {
      clearAsrVerification()
      previousAsrVerificationSignatureRef.current = asrVerificationSignature
    }
  }, [asrVerificationSignature])

  // Automatically reset verify status back to idle after a delay
  useEffect(() => {
    if (verifyStatus === VERIFY_STATUS.SUCCESS || verifyStatus === VERIFY_STATUS.FAIL) {
      const timer = setTimeout(() => {
        setVerifyStatus(VERIFY_STATUS.IDLE)
      }, VERIFY_RESET_DELAY_MS)
      return () => clearTimeout(timer)
    }
  }, [verifyStatus])

  const handleVerify = async () => {
    const values = form.getValues()
    const provider = values.asrProvider.trim()
    const model = values.asrModel.trim()
    const customModel = values.asrCustomModelId.trim()
    const useCustomModel = values.asrUseCustomModel
    const apiKey = values.asrKey?.trim()

    const validation = validateAsrProviderModelSelection({
      asrProvider: provider,
      asrModel: model,
      asrUseCustomModel: useCustomModel,
      asrCustomModelId: customModel,
    })

    if (!validation.ok && validation.code === ASR_CONFIG_ERROR.UNCONFIGURED_PROVIDER) {
      form.setError('asrProvider', {
        type: 'manual',
        message: t('validationProviderRequired', { defaultValue: 'Provider is required' }),
      })
      return
    }
    if (!validation.ok && validation.code === ASR_CONFIG_ERROR.UNCONFIGURED_MODEL) {
      if (useCustomModel) {
        form.setError('asrCustomModelId', {
          type: 'manual',
          message: t('validationCustomModelRequired', { defaultValue: 'Custom model is required' }),
        })
      } else {
        form.setError('asrModel', {
          type: 'manual',
          message: t('validationModelRequired', { defaultValue: 'Model is required' }),
        })
      }
      return
    }
    if (!validation.ok && validation.code === ASR_CONFIG_ERROR.INVALID_PROVIDER_MODEL_PAIR) {
      form.setError('asrModel', {
        type: 'manual',
        message: t('validationProviderModelPairInvalid', {
          defaultValue: 'Model is not supported by the selected provider',
        }),
      })
      return
    }
    if (!validation.ok) return

    if (!apiKey || verifyStatus !== VERIFY_STATUS.IDLE) return

    setVerifyStatus(VERIFY_STATUS.VERIFYING)
    try {
      const ok = await verifyAsrKey({ apiKey, provider: provider as ASRProvider })
      if (ok) {
        await markAsrVerificationSucceeded({
          provider: validation.provider,
          model: validation.model,
          apiKey,
        })
      } else {
        clearAsrVerification()
      }
      setVerifyStatus(ok ? VERIFY_STATUS.SUCCESS : VERIFY_STATUS.FAIL)
    } catch (error: unknown) {
      clearAsrVerification()
      if (error instanceof ASRClientError && error.code === 'unauthorized') {
        form.setError('asrKey', {
          type: 'manual',
          message: error.message,
        })
      }
      setVerifyStatus(VERIFY_STATUS.FAIL)
    }
  }

  const suppressSelectTrigger = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  // Reset model when provider changes (models are provider-specific)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally only react to provider changes
  useEffect(() => {
    if (asrUseCustomModel) return
    const currentModel = form.getValues('asrModel')
    if (currentModel && !isAsrModelSupportedForProvider(asrProvider, currentModel)) {
      form.setValue('asrModel', '')
      void onFieldBlur()
    }
  }, [asrProvider, asrUseCustomModel])

  return (
    <SettingsSectionCard title={t('settingsAsrTitle')} description={t('settingsAsrDesc')}>
      <Form {...form}>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <p className="text-xs text-muted-foreground">{t('settingsAsrCostNote')}</p>
                {providerDocsUrl ? (
                  <Button variant="link" size="sm" asChild className="h-auto px-0 py-0">
                    <a href={providerDocsUrl} target="_blank" rel="noopener noreferrer">
                      {t('settingsAsrPricingLink')}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <FormField
            control={form.control}
            name="asrProvider"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="mb-2 block text-sm font-medium">
                  {t('settingsAsrProvider')}
                </FormLabel>
                <div className="group/provider-clear relative max-w-md">
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value)
                      void onFieldBlur()
                    }}
                  >
                    <FormControl>
                      <SelectTrigger
                        className={
                          field.value
                            ? '[&>svg]:transition-opacity [&>svg]:duration-150 group-hover/provider-clear:[&>svg]:opacity-0 data-[state=open]:[&>svg]:opacity-0'
                            : undefined
                        }
                      >
                        <SelectValue
                          placeholder={t('settingsAsrProviderPlaceholder', {
                            defaultValue: 'Select a provider',
                          })}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {enabledProviders.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {getAsrProviderConfig(provider).label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {field.value ? (
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      className="absolute right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 p-0 opacity-0 pointer-events-none transition-all duration-150 group-hover/provider-clear:opacity-100 group-hover/provider-clear:pointer-events-auto"
                      aria-label="Clear ASR provider"
                      onPointerDown={suppressSelectTrigger}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        form.setValue('asrProvider', '', { shouldDirty: true, shouldTouch: true })
                        form.setValue('asrModel', '', { shouldDirty: true, shouldTouch: true })
                        form.setValue('asrUseCustomModel', false, {
                          shouldDirty: true,
                          shouldTouch: true,
                        })
                        form.setValue('asrCustomModelId', '', {
                          shouldDirty: true,
                          shouldTouch: true,
                        })
                        void onFieldBlur()
                      }}
                    >
                      <X className={SELECT_CLEAR_ICON_CLASS} />
                    </Button>
                  ) : null}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="asrModel"
            render={({ field }) => {
              const currentProvider = form.getValues('asrProvider').trim()
              const isModelDisabled = !currentProvider

              return (
                <FormItem>
                  <FormLabel className="mb-2 block text-sm font-medium">
                    {t('settingsAsrModel')}
                  </FormLabel>
                  <div className="group/model-clear relative max-w-md">
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        if (value === CUSTOM_MODEL_OPTION_VALUE) {
                          form.setValue('asrUseCustomModel', true, {
                            shouldDirty: true,
                            shouldTouch: true,
                          })
                          form.setValue('asrModel', '', { shouldDirty: true, shouldTouch: true })
                        } else {
                          form.setValue('asrUseCustomModel', false, {
                            shouldDirty: true,
                            shouldTouch: true,
                          })
                          form.setValue('asrCustomModelId', '', {
                            shouldDirty: true,
                            shouldTouch: true,
                          })
                          field.onChange(value)
                        }
                        void onFieldBlur()
                      }}
                      disabled={isModelDisabled}
                    >
                      <FormControl>
                        <SelectTrigger
                          className={
                            field.value
                              ? '[&>svg]:transition-opacity [&>svg]:duration-150 group-hover/model-clear:[&>svg]:opacity-0 data-[state=open]:[&>svg]:opacity-0'
                              : undefined
                          }
                        >
                          <SelectValue
                            placeholder={t('settingsAsrModelPlaceholder', {
                              defaultValue: 'Select a model',
                            })}
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                        {models.length > 0 ? <SelectSeparator /> : null}
                        <SelectItem value={CUSTOM_MODEL_OPTION_VALUE}>
                          {t('settingsAsrUseCustomModel', {
                            defaultValue: 'Use custom model ID',
                          })}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {field.value && currentProvider ? (
                      <Button
                        type="button"
                        variant="text"
                        size="sm"
                        className="absolute right-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 p-0 opacity-0 pointer-events-none transition-all duration-150 group-hover/model-clear:opacity-100 group-hover/model-clear:pointer-events-auto"
                        aria-label="Clear ASR model"
                        onPointerDown={suppressSelectTrigger}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          form.setValue('asrModel', '', { shouldDirty: true, shouldTouch: true })
                          form.setValue('asrUseCustomModel', false, {
                            shouldDirty: true,
                            shouldTouch: true,
                          })
                          form.setValue('asrCustomModelId', '', {
                            shouldDirty: true,
                            shouldTouch: true,
                          })
                          void onFieldBlur()
                        }}
                      >
                        <X className={SELECT_CLEAR_ICON_CLASS} />
                      </Button>
                    ) : null}
                  </div>
                  <FormMessage />
                </FormItem>
              )
            }}
          />

          {asrUseCustomModel ? (
            <FormField
              control={form.control}
              name="asrCustomModelId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="mb-2 block text-sm font-medium">
                    {t('settingsAsrCustomModelId')}
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t('settingsAsrCustomModelPlaceholder', {
                        defaultValue: 'Enter custom model ID',
                      })}
                      className="max-w-md"
                      {...field}
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
          ) : null}

          <FormField
            control={form.control}
            name="asrKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="mb-2 block text-sm font-medium">
                  {t('settingsAsrApiKey')}
                </FormLabel>
                <div className="flex max-w-md items-center gap-2">
                  <FormControl>
                    <Input
                      type={showKey ? 'text' : 'password'}
                      placeholder={
                        asrProvider === 'volcengine'
                          ? t('settingsAsrVolcengineKeyPlaceholder')
                          : t('placeholderApiKey')
                      }
                      className="flex-1"
                      {...field}
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
                    aria-label={t('settingsShowHideApiKey')}
                    disabled={!field.value?.trim()}
                    onClick={() => setShowKey((value) => !value)}
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={verifyStatus === VERIFY_STATUS.VERIFYING || !field.value?.trim()}
                    onClick={() => {
                      if (verifyStatus === VERIFY_STATUS.IDLE) {
                        void handleVerify()
                      }
                    }}
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
        </div>
      </Form>
    </SettingsSectionCard>
  )
})
