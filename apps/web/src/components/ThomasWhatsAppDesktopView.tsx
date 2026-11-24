import type { ThomasWhatsAppDesktopViewProps } from '../features/thomasDesktop/base';
import { useThomasDesktop } from '../features/thomasDesktop/useThomasDesktop';
import { ListaLeads } from '../features/thomasDesktop/blocos/ListaLeads';
import { ChatConversa } from '../features/thomasDesktop/blocos/ChatConversa';
import { DossieLead } from '../features/thomasDesktop/blocos/DossieLead';
import { ModalModelos } from '../features/thomasDesktop/blocos/ModalModelos';
import { ModalRespostasRapidas } from '../features/thomasDesktop/blocos/ModalRespostasRapidas';

export const ThomasWhatsAppDesktopView: React.FC<ThomasWhatsAppDesktopViewProps> = (props) => {
  const f = useThomasDesktop(props);

  return (
    <div className="w-full h-full flex flex-col xl:flex-row bg-[#f8f9fa] border border-neutral-200 rounded-2xl overflow-hidden shadow-2xs">
      <ListaLeads f={f} />
      <ChatConversa f={f} />
      <DossieLead f={f} />
      <ModalModelos f={f} />
      <ModalRespostasRapidas f={f} />
    </div>
  );
};
