import { computed, ref, type Ref } from 'vue';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { getMyPeriod, getMyPeriods } from '../api';

const PER_PAGE = 12;

export function useContactHistory() {
  const page = ref(1);

  const periodsQuery = useQuery({
    queryKey: ['my', 'periods', page],
    queryFn: () => getMyPeriods(page.value, PER_PAGE),
    placeholderData: keepPreviousData,
  });

  const pageCount = computed(() => {
    const total = periodsQuery.data.value?.meta.total ?? 0;
    return Math.max(1, Math.ceil(total / PER_PAGE));
  });

  return { page, pageCount, periodsQuery };
}

export function useContactPeriod(selected: Ref<{ periodId: string; companyId: string } | null>) {
  return useQuery({
    queryKey: ['my', 'period', selected],
    queryFn: () => getMyPeriod(selected.value!.periodId, selected.value!.companyId),
    enabled: computed(() => selected.value !== null),
  });
}
