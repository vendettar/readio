import { memo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { SettingsFormValues } from '@/lib/schemas/settings'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../ui/form'
import { Input } from '../../ui/input'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface TranslateApiKeysSettingsSectionProps {
  form: UseFormReturn<SettingsFormValues>
  onSubmit: () => void | Promise<void>
  onFieldBlur: () => Promise<void>
}

export const TranslateApiKeysSettingsSection = memo(function TranslateApiKeysSettingsSection({
  form,
  onSubmit,
  onFieldBlur,
}: TranslateApiKeysSettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard title={t('settingsAiServices')} description={t('settingsAiServicesDesc')}>
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit()
          }}
        >
          <FormField
            control={form.control}
            name="translateKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settingsOpenAiKey')}</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder={t('placeholderApiKey')}
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
        </form>
      </Form>
    </SettingsSectionCard>
  )
})
