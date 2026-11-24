import { QuickRepliesModal } from '../../../components/QuickRepliesModal';
import type { DesktopVM } from '../useThomasDesktop';

export function ModalRespostasRapidas({ f }: { f: DesktopVM }) {
  const { onShowToast, activeSalesperson, setInputText, isQuickRepliesModalOpen, setIsQuickRepliesModalOpen, fetchQuickReplies, activeLead, replaceLeadVariables } = f;
  return (
    <>
      {/* Quick Replies Modal */}
      <QuickRepliesModal
        isOpen={isQuickRepliesModalOpen}
        onClose={() => {
          setIsQuickRepliesModalOpen(false);
          fetchQuickReplies();
        }}
        activeSalesperson={activeSalesperson}
        onShowToast={onShowToast}
        onSelectReply={(content) => {
          setInputText(replaceLeadVariables(content, activeLead));
        }}
      />
    </>
  );
}
