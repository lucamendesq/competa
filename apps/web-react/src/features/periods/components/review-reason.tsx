import { REASON_MAX_LENGTH } from '@/features/periods/components/review-draft';
import { Textarea } from '@/shared/components/ui/textarea';

type ReviewReasonProps = {
  id: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export function ReviewReason({ id, value, placeholder, onChange }: ReviewReasonProps) {
  return (
    <div className="pt-1">
      <Textarea
        id={id}
        aria-label={placeholder}
        value={value}
        placeholder={placeholder}
        rows={2}
        maxLength={REASON_MAX_LENGTH}
        className="border-danger-border focus-visible:ring-ring focus-visible:border-primary text-sm shadow-xs"
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-muted-foreground mt-1 text-right text-xs tabular-nums">
        {value.length}/{REASON_MAX_LENGTH}
      </p>
    </div>
  );
}
