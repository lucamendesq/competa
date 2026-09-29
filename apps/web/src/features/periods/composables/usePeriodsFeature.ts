import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import { getPeriodsList, getPeriodDetail, openPeriod, closePeriod, runReminders, downloadPeriodZip, downloadRequestZip } from '../api/periods'
import { computed, type Ref } from 'vue'

export function usePeriodsFeature(page: Ref<number>, perPage: number) {
  const queryClient = useQueryClient()
  
  const periodsQueryKey = computed(() => ['periods', { page: page.value, perPage }])
  
  const periodsQuery = useQuery({
    queryKey: periodsQueryKey,
    queryFn: () => getPeriodsList({ page: page.value, perPage }),
    placeholderData: (prev) => prev
  })

  // To reload we can expose invalidation
  const reloadPeriods = () => queryClient.invalidateQueries({ queryKey: ['periods'] })

  const openPeriodMutation = useMutation({
    mutationFn: (body: { referenceMonth: string; dueDate?: string }) => openPeriod(body),
    onSuccess: () => reloadPeriods()
  })

  const closePeriodMutation = useMutation({
    mutationFn: (id: string) => closePeriod(id),
    onSuccess: () => reloadPeriods()
  })

  const runRemindersMutation = useMutation({
    mutationFn: () => runReminders()
  })

  return {
    periodsQuery,
    reloadPeriods,
    openPeriodMutation,
    closePeriodMutation,
    runRemindersMutation,
    downloadPeriodZip,
    downloadRequestZip
  }
}

export function usePeriodDetailFeature(id: Ref<string | undefined>) {
  const queryKey = computed(() => ['periodDetail', id.value])
  
  const detailQuery = useQuery({
    queryKey,
    queryFn: () => id.value ? getPeriodDetail(id.value) : undefined,
    enabled: computed(() => !!id.value)
  })

  return {
    detailQuery
  }
}
