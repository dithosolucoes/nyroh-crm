#!/bin/bash
# Item 5.5 c: o build de produção não contém dados falsos (modo designer).
# Três casos: (1) produção sem flag => 0 arquivos com o marcador;
# (2) produção COM USE_MOCK_API=true => 0 (produção recusa o mock);
# (3) desenvolvimento COM flag => >=1 (controle: o marcador aparece quando o mock está ligado).
set -e
cd "$(dirname "$0")/../frontend"
MARCA='MARCADOR-DADOS-FALSOS-NYROH'
contar() { grep -rl "$MARCA" "$1" 2>/dev/null | wc -l; }
falhas=0
rm -rf "$HOME/bundle-t1" "$HOME/bundle-t2" "$HOME/bundle-t3"
env -u USE_MOCK_API npx vite build --outDir "$HOME/bundle-t1" --emptyOutDir >/dev/null 2>&1
n1=$(contar "$HOME/bundle-t1"); [ "$n1" = "0" ] && echo "  ok  producao sem flag: sem dados falsos" || { echo "  FALHA producao sem flag: $n1 arquivo(s) com dados falsos"; falhas=1; }
env USE_MOCK_API=true npx vite build --outDir "$HOME/bundle-t2" --emptyOutDir >/dev/null 2>&1
n2=$(contar "$HOME/bundle-t2"); [ "$n2" = "0" ] && echo "  ok  producao com flag: recusada, sem dados falsos" || { echo "  FALHA producao com flag: $n2 arquivo(s) com dados falsos"; falhas=1; }
env USE_MOCK_API=true npx vite build --mode development --outDir "$HOME/bundle-t3" --emptyOutDir >/dev/null 2>&1
n3=$(contar "$HOME/bundle-t3"); [ "$n3" -ge 1 ] && echo "  ok  controle: desenvolvimento com flag contém os dados falsos ($n3)" || { echo "  FALHA controle: dados falsos ausentes com a flag ligada"; falhas=1; }
exit $falhas
