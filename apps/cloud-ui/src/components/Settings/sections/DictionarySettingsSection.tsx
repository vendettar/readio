import { memo } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import type { SettingsFormValues } from '@/lib/schemas/settings'
import { Form, FormControl, FormField, FormItem, FormLabel } from '../../ui/form'
import { Switch } from '../../ui/switch'
import { SettingsSectionCard } from '../SettingsSectionCard'

interface DictionarySettingsSectionProps {
  form: UseFormReturn<SettingsFormValues>
  onFieldBlur: () => Promise<void>
}

export const DictionarySettingsSection = memo(function DictionarySettingsSection({
  form,
  onFieldBlur,
}: DictionarySettingsSectionProps) {
  const { t } = useTranslation()

  return (
    <SettingsSectionCard title={t('settingsDictionary')} description={t('settingsDictionaryDesc')}>
      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <FormField
            control={form.control}
            name="pauseOnDictionaryLookup"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <FormLabel htmlFor="pause-on-lookup" className="cursor-pointer font-normal">
                    {t('settingsPauseOnLookup')}
                  </FormLabel>
                </div>
                <FormControl>
                  <Switch
                    id="pause-on-lookup"
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked)
                      void onFieldBlur()
                    }}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </form>
      </Form>
    </SettingsSectionCard>
  )
})
