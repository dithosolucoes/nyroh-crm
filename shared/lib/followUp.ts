export type FollowUpStatus = 'OVERDUE' | 'TODAY' | 'SCHEDULED' | 'NONE';

export interface FollowUpInfo {
  status: FollowUpStatus;
  label: string;
  formattedDate: string;
  isUrgent: boolean;
}

export const getFollowUpInfo = (followUpAt?: string): FollowUpInfo => {
  if (!followUpAt) {
    return { status: 'NONE', label: '', formattedDate: '', isUrgent: false };
  }

  const date = new Date(followUpAt);
  if (isNaN(date.getTime())) {
    return { status: 'NONE', label: '', formattedDate: '', isUrgent: false };
  }

  const now = new Date();
  const isPast = date.getTime() < now.getTime();
  
  // Check if same calendar day
  const isSameDay = 
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  if (isPast && !isSameDay) {
    return {
      status: 'OVERDUE',
      label: `Atrasado (${dateStr} às ${timeStr})`,
      formattedDate: `${dateStr} ${timeStr}`,
      isUrgent: true
    };
  }

  if (isSameDay) {
    if (isPast) {
      return {
        status: 'OVERDUE',
        label: `Atrasado Hoje (${timeStr})`,
        formattedDate: `${dateStr} ${timeStr}`,
        isUrgent: true
      };
    }
    return {
      status: 'TODAY',
      label: `Retorno Hoje (${timeStr})`,
      formattedDate: `${dateStr} ${timeStr}`,
      isUrgent: true
    };
  }

  return {
    status: 'SCHEDULED',
    label: `Agendado (${dateStr} ${timeStr})`,
    formattedDate: `${dateStr} ${timeStr}`,
    isUrgent: false
  };
};
