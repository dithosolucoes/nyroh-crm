"""
CRM de Leads e Ligações - Ultra Clean Streamlit App (Railway Ready)
"""
import os
import re
import json
import zipfile
import io
import psycopg2
from psycopg2.extras import RealDictCursor
import streamlit as st
import qrcode
from PIL import Image

# Configuração da página
st.set_page_config(
    page_title="CRM de Leads e Ligações",
    page_icon="💼",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Estilo Ultra-Clean / Google Design System
st.markdown("""
<style>
    /* Estilo Global Google Light Mode */
    .main {
        background-color: #f8f9fa;
        color: #202124;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    
    /* SideBar Clean */
    [data-testid="stSidebar"] {
        background-color: #ffffff;
        border-right: 1px solid #e0e0e0;
    }
    
    /* Cards do Kanban */
    .kanban-card {
        background-color: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 12px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        transition: all 0.2s ease;
    }
    .kanban-card:hover {
        border-color: #1a73e8;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    
    .lead-title {
        font-weight: 600;
        font-size: 14px;
        color: #202124;
        margin-bottom: 6px;
    }
    
    .btn-group {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-top: 8px;
    }

    /* Colunas Kanban */
    .kanban-column-header {
        font-size: 13px;
        font-weight: 600;
        color: #5f6368;
        padding: 8px 12px;
        background-color: #f1f3f4;
        border-radius: 6px;
        margin-bottom: 12px;
        text-align: center;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
</style>
""", unsafe_allow_html=True)

# 8 Colunas Estritas
COLUMNS = [
    'Leads',
    'Ligação 1',
    'Ligação 2',
    'Ligação 3',
    'Ligação 4',
    'Interessado',
    'Fechado',
    'Recusado'
]

TAGS = ['Atendeu', 'Não Atendeu', 'Caixa Postal', 'Ocupado', 'Pediu para retornar']

# Conexão com PostgreSQL via DATABASE_URL
@st.cache_resource
def get_db_connection():
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        return None
    try:
        conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
        conn.autocommit = True
        return conn
    except Exception as e:
        st.error(f"Erro ao conectar ao PostgreSQL: {e}")
        return None

def init_db():
    conn = get_db_connection()
    if conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS leads (
                    id VARCHAR(255) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    phone_number VARCHAR(100) NOT NULL,
                    public_url TEXT,
                    column_status VARCHAR(100) NOT NULL DEFAULT 'Leads',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS calls (
                    id VARCHAR(255) PRIMARY KEY,
                    lead_id VARCHAR(255) NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
                    tag VARCHAR(100) NOT NULL,
                    comment TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );
            """)

# Funções auxiliares de número de telefone
def extract_digits(phone_str):
    if not phone_str:
        return ""
    return re.sub(r'\D', '', str(phone_str))

def get_qr_tel_url(phone_str):
    digits = extract_digits(phone_str)
    # REGRA CRUCIAL: Adiciona o 0 na frente do DDD apenas no link do QR code: tel:0[Apenas_Numeros]
    return f"tel:0{digits}"

def generate_qr_image(tel_url):
    qr = qrcode.QRCode(version=1, box_size=6, border=2)
    qr.add_data(tel_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

# Inicialização do banco
init_db()

# SIDEBAR: Upload de ZIP e Navegação
st.sidebar.title("💼 CRM de Leads")
st.sidebar.caption("Sistema de Acompanhamento & Ligações")

st.sidebar.markdown("---")
st.sidebar.subheader("📥 Importação de Leads (.ZIP)")

uploaded_zip = st.sidebar.file_uploader("Selecione o arquivo .ZIP com os JSONs", type=["zip"])

if uploaded_zip is not None:
    if st.sidebar.button("Processar ZIP", use_container_width=True):
        try:
            with zipfile.ZipFile(uploaded_zip, 'r') as z:
                total_files = 0
                inserted = 0
                duplicates = 0
                
                conn = get_db_connection()
                
                for filename in z.namelist():
                    # Processa recursivamente qualquer arquivo .json nas subpastas
                    if filename.lower().endswith('.json') and not filename.startswith('__MACOSX'):
                        total_files += 1
                        with z.open(filename) as f:
                            try:
                                data = json.load(f)
                                lead_id = str(data.get('id', '')).strip()
                                name = str(data.get('name', '')).strip()
                                phone = str(data.get('phoneNumber', '')).strip()
                                
                                ditho_meta = data.get('dithoSitesMetadata', {})
                                public_url = ditho_meta.get('publicUrl', '') if isinstance(ditho_meta, dict) else ''

                                if lead_id and name and phone:
                                    if conn:
                                        with conn.cursor() as cur:
                                            cur.execute("""
                                                INSERT INTO leads (id, name, phone_number, public_url, column_status)
                                                VALUES (%s, %s, %s, %s, 'Leads')
                                                ON CONFLICT (id) DO NOTHING;
                                            """, (lead_id, name, phone, public_url))
                                            if cur.rowcount > 0:
                                                inserted += 1
                                            else:
                                                duplicates += 1
                                    else:
                                        # Fallback em memória na sessão
                                        if 'memory_leads' not in st.session_state:
                                            st.session_state.memory_leads = {}
                                        if lead_id in st.session_state.memory_leads:
                                            duplicates += 1
                                        else:
                                            st.session_state.memory_leads[lead_id] = {
                                                'id': lead_id,
                                                'name': name,
                                                'phone_number': phone,
                                                'public_url': public_url,
                                                'column_status': 'Leads'
                                            }
                                            inserted += 1
                            except Exception as json_err:
                                pass
                
                st.sidebar.success(f"✅ Processamento Concluído!\n- Importados: {inserted}\n- Duplicados Ignorados: {duplicates}")
        except Exception as zip_err:
            st.sidebar.error(f"Erro ao processar arquivo ZIP: {zip_err}")

st.sidebar.markdown("---")
page = st.sidebar.radio("Navegação", ["Pipeline (Kanban)", "Lista de Leads"], index=0)

# FUNÇÃO PARA LER LEADS
def fetch_leads():
    conn = get_db_connection()
    if conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM leads ORDER BY created_at DESC;")
            return cur.fetchall()
    else:
        if 'memory_leads' not in st.session_state:
            st.session_state.memory_leads = {}
        return list(st.session_state.memory_leads.values())

def fetch_calls(lead_id):
    conn = get_db_connection()
    if conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM calls WHERE lead_id = %s ORDER BY created_at DESC;", (lead_id,))
            return cur.fetchall()
    else:
        if 'memory_calls' not in st.session_state:
            st.session_state.memory_calls = {}
        return st.session_state.memory_calls.get(lead_id, [])

def update_lead_column(lead_id, new_status):
    conn = get_db_connection()
    if conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE leads SET column_status = %s, updated_at = NOW() WHERE id = %s;", (new_status, lead_id))
    else:
        if 'memory_leads' in st.session_state and lead_id in st.session_state.memory_leads:
            st.session_state.memory_leads[lead_id]['column_status'] = new_status

def add_call_log(lead_id, tag, comment):
    call_id = f"call_{os.urandom(4).hex()}"
    conn = get_db_connection()
    if conn:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO calls (id, lead_id, tag, comment) VALUES (%s, %s, %s, %s);", (call_id, lead_id, tag, comment))
    else:
        if 'memory_calls' not in st.session_state:
            st.session_state.memory_calls = {}
        if lead_id not in st.session_state.memory_calls:
            st.session_state.memory_calls[lead_id] = []
        st.session_state.memory_calls[lead_id].insert(0, {
            'id': call_id,
            'tag': tag,
            'comment': comment,
            'created_at': 'Agora'
        })

# PAINEL KANBAN PIPELINE
if page == "Pipeline (Kanban)":
    st.title("📌 Pipeline de Vendas & Ligações")
    
    leads = fetch_leads()
    
    # Renderiza as 8 colunas estritas
    cols = st.columns(len(COLUMNS))
    
    for idx, col_name in enumerate(COLUMNS):
        with cols[idx]:
            # Leads nesta coluna
            col_leads = [l for l in leads if l['column_status'] == col_name]
            
            st.markdown(f"<div class='kanban-column-header'>{col_name} ({len(col_leads)})</div>", unsafe_allow_html=True)
            
            for lead in col_leads:
                lead_id = lead['id']
                name = lead['name']
                phone = lead['phone_number']
                url = lead['public_url'] or '#'
                
                with st.container():
                    st.markdown(f"**{name}**")
                    st.caption(f"📞 {phone}")
                    
                    # Botões do Card
                    b_col1, b_col2, b_col3, b_col4 = st.columns([1,1,1,1])
                    
                    with b_col1:
                        # WhatsApp Link (mantendo apenas números com código 55)
                        digits = extract_digits(phone)
                        wa_url = f"https://wa.me/55{digits}"
                        st.markdown(f"[💬 WA]({wa_url})")
                        
                    with b_col2:
                        if url and url != '#':
                            st.markdown(f"[🌐 Site]({url})")
                    
                    with b_col3:
                        if st.button("🔍 Detalhes", key=f"det_{lead_id}"):
                            st.session_state.selected_lead = lead_id

                    # Seleção de troca de coluna
                    new_col = st.selectbox(
                        "Mover",
                        COLUMNS,
                        index=COLUMNS.index(col_name),
                        key=f"move_{lead_id}",
                        label_visibility="collapsed"
                    )
                    if new_col != col_name:
                        update_lead_column(lead_id, new_col)
                        st.rerun()

                    st.markdown("---")

    # POPUP / MODAL DE DETALHES DO LEAD
    if 'selected_lead' in st.session_state and st.session_state.selected_lead:
        sel_id = st.session_state.selected_lead
        lead_data = next((l for l in leads if l['id'] == sel_id), None)
        
        if lead_data:
            st.markdown("---")
            st.subheader(f"📋 Histórico & Detalhes: {lead_data['name']}")
            
            col_a, col_b = st.columns([2, 1])
            
            with col_a:
                st.write(f"**ID:** `{lead_data['id']}`")
                st.write(f"**Telefone Bruto:** `{lead_data['phone_number']}` (Utilize sem 0 para copiar)")
                st.write(f"**Link do Site:** [{lead_data['public_url']}]({lead_data['public_url']})")
                
                # Novo Registro de Ligação
                st.markdown("##### 📞 Registrar Nova Ligação")
                with st.form(key=f"form_call_{sel_id}"):
                    tag = st.selectbox("Etiqueta do Resultado", TAGS)
                    comment = st.text_area("Comentários da Ligação", placeholder="Ex: Cliente demonstrou interesse, pediu orçamento.")
                    submitted = st.form_submit_button("Salvar Ligação")
                    
                    if submitted:
                        add_call_log(sel_id, tag, comment)
                        st.success("Ligação registrada com sucesso!")
                        st.rerun()

            with col_b:
                # Exibição do QR Code (Regra Crucial: tel:0[Numeros])
                qr_link = get_qr_tel_url(lead_data['phone_number'])
                qr_img = generate_qr_image(qr_link)
                st.image(qr_img, caption=f"QR Code Discagem ({qr_link})", width=160)
                st.caption("Aponte a câmera do celular para discar com '0' antes do DDD.")

            st.markdown("##### 📜 Histórico Cronológico de Ligações")
            calls = fetch_calls(sel_id)
            if calls:
                for c in calls:
                    st.info(f"**[{c.get('tag')}]** - *{c.get('created_at')}*\n\n{c.get('comment')}")
            else:
                st.caption("Nenhuma ligação registrada para este lead ainda.")
                
            if st.button("Fechar Detalhes"):
                st.session_state.selected_lead = None
                st.rerun()

elif page == "Lista de Leads":
    st.title("📊 Todos os Leads Registrados")
    leads = fetch_leads()
    st.dataframe(leads)
