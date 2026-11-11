# Alvarás em São Paulo — mapa por ano (2000–2026)

Site estático que mostra os **alvarás aprovados no município de São Paulo** de 2000 a 2026, por ano e por tipo,
e exporta cada mapa em **PNG** (A4 300 dpi ou 16:9), com título, legenda, escala, norte e fonte.

Junta duas fontes da Prefeitura:

- **Processos aprovados — SEHAB/SMUL** (relatório anual de processos aprovados; sistema SLE): 2000 a 2026, exceto 2023.
- **Aprova Digital — SMUL** (relatório anual de alvarás emitidos): 2022, 2023 e 2026 (jan–jun).

Não há planilha do Aprova Digital para 2024 e 2025, nem planilha SEHAB/SMUL para 2023: nesses anos o total é menor
porque falta uma das fontes (o site avisa).

## O que o site faz

- Escolher o **ano** numa barra com o total de cada ano (2000–2026) e o **recorte** (município inteiro ou um dos 96 distritos).
- Ligar/desligar cada **tipo de alvará** na legenda (com contagem).
- Filtrar pela **etapa** (aprovação, execução, aprovação e execução), pelo **ato** (emissão, reconsideração de despacho,
  apostilamento, revalidação) e pelo **sistema** (SEHAB/SMUL ou Aprova Digital).
- Passar o mouse sobre um ponto para ver o endereço; clicar para ver processo, SQL, distrito, uso no IPTU.
- **Exportar PNG** do ano atual ou uma **série** de anos (um PNG por ano, mesmo enquadramento e estilo).
- Baixar os dados filtrados em **CSV** (abre no Excel) ou **GeoJSON** (abre no QGIS).
- Ranking dos distritos com mais alvarás.

## Legenda

A **forma** indica o tipo de alvará. Nas obras (edificação nova, projeto modificativo e reforma) a **cor** mostra
HIS/HMP ou a categoria de uso, com as mesmas cores nos três tipos:

| Forma | Tipo | Cores |
|---|---|---|
| ● ◆ ■ | Edificação nova (círculo), projeto modificativo (losango), reforma (quadrado; inclui reconstrução) | laranja = HIS/HMP · azul-claro = **R1** residência unifamiliar · verde-petróleo = **R2h** conjunto horizontal · azul = **R2v** conjunto vertical (prédio) · lavanda = **R2/R3** residencial multifamiliar (lei antiga) · metade azul/metade vermelho = **R + NR** uso misto · vermelho = **NR** não residencial · cinza-azulado = uso não informado (Aprova Digital) · verde-água = processo declaratório (só edificação nova) |
| ▲ triângulo | Demolição | preto |
| ✚ cruz | Regularização (auto ou certificado de regularização, inclui Lei 13.558/2003) | cinza escuro |
| ▼ triângulo invertido | Parcelamento do solo (desdobro, desmembramento, loteamento, diretrizes) | cinza escuro |
| ○ anel | Certificado de conclusão | cinza |
| • ponto | Funcionamento, equipamentos e outros (alvará de autorização, local de reunião, tanques, segurança, acessibilidade, mudança de uso, movimento de terra…) | cinza claro |

Nos **processos SEHAB/SMUL**, HIS/HMP vem da descrição ou da **categoria de uso** (HIS, HMP, EHIS, EHMP, EZEIS)
ou do tipo de construção “habitação de interesse social”. No **Aprova Digital** vem só da descrição, e
como ele não informa a categoria de uso, as obras exceto HIS/HMP ficam como “uso não informado”.
No PNG, a legenda das obras é uma tabela: uma linha por categoria e uma coluna por tipo (forma).
Quando um alvará tem categorias residenciais e não residenciais ao mesmo tempo, entra em **R + NR (uso misto)**.
As cores foram conferidas para daltonismo e visão normal (todos os pares).

### Categoria de uso

As planilhas SEHAB/SMUL trazem a **categoria de uso** do projeto; o site mostra o código e a descrição e permite
filtrar por ela. O Aprova Digital não informa a categoria (fica em “Sem categoria”). Subcategorias viram a
categoria principal (S2.1 → S2, NR1-04 → NR1). Um alvará com mais de uma categoria (uso misto) entra em cada uma.

| Código | Descrição |
|---|---|
| R1 | Residência unifamiliar (casa) |
| R2h | Conjunto residencial horizontal (vila, condomínio de casas) |
| R2v | Conjunto residencial vertical (prédio) |
| R2 / R3 | Residência multifamiliar / conjunto residencial (lei antiga) |
| HIS / HMP | Habitação de Interesse Social / de Mercado Popular |
| EHIS / EHMP / EZEIS | Empreendimento de HIS / de HMP / em ZEIS |
| NR1 | Não residencial compatível (comércio e serviços de bairro) |
| NR2 | Não residencial tolerável |
| NR3 | Não residencial especial ou incômodo |
| NR4 / NR5 | Não residencial, subcategorias nR4 / nR5 |
| IND / INFRA | Industrial / infraestrutura |
| C1 / C2 / C3 | Comércio varejista local / varejista diversificado / atacadista (lei antiga) |
| S1 / S2 / S3 | Serviços locais / diversificados / especiais (lei antiga) |
| I1 / I2 / I3 | Indústria não incômoda / diversificada / especial (lei antiga) |
| E1 / E2 / E3 / E4 | Instituições locais / diversificadas / especiais / usos especiais (lei antiga) |

“Lei antiga” = Lei 8.001/1973 (zoneamento até 2004); os demais códigos são das Leis 13.885/2004 e 16.402/2016.

**Ato**: “Emissão” é o alvará em si; “Reconsideração de despacho”, “Apostilamento” e “Revalidação/renovação”
são atos sobre um alvará já existente. Para contar obras novas, deixe só “Emissão”.

## Publicar

O site é estático (não precisa de build). O repositório **não** leva `dados_brutos/` (as planilhas originais
têm nomes de proprietários e responsáveis técnicos), `cache/`, `previas/` nem `scripts/node_modules/` — veja o `.gitignore`.

**Vercel** (recomendado): em vercel.com → **Add New → Project** → importe o repositório do GitHub →
Framework Preset **Other**, sem comando de build, pasta de saída na raiz → **Deploy**.
Cada `git push` na branch `main` publica de novo sozinho.

**GitHub Pages** (alternativa): no repositório, **Settings → Pages → Deploy from a branch**, branch `main`,
pasta `/ (root)`. O site fica em `https://<seu-usuario>.github.io/mapa-alvaras-sp/`.

## Rodar no computador

O site precisa ser aberto por um servidor (abrir o `index.html` direto não carrega os dados). Com Node instalado:

```bash
node scripts/serve.js
```

e abra http://localhost:8080.

## Adicionar ou atualizar um ano

1. Salve a planilha com o ano no nome:
   - relatório anual de processos aprovados (SEHAB/SMUL) → `dados_brutos/processos_aprovados/PA_<ano>.xls` (ou `.xlsx`);
   - relatório anual do Aprova Digital → `dados_brutos/aprova_digital/AD_<ano>.xlsx`.

   O script acha o cabeçalho sozinho (linha com “Descrição” e “Alvará” ou “SQLs”), em qualquer aba.
2. Rode o processamento (precisa de internet para consultar o GeoSampa; ~15 min na primeira vez, depois usa o cache):

```bash
cd scripts
npm install
node build_data.js
```

3. Os arquivos em `data/` são regravados e o ano novo aparece no site.

## Como os dados foram montados

1. **Leitura** de cada planilha anual. Cada linha é um alvará. Nomes de pessoas (proprietário, responsáveis
   técnicos, autor do projeto) **não** são publicados no site.
2. **Classificação** pela coluna “Descrição”: tipo × condição HIS/HMP × etapa (aprovação, execução,
   aprovação e execução) × ato (emissão, reconsideração, apostilamento, revalidação).
   “EXCETO HIS/HMP” é testado antes de “HIS”, porque contém “HIS”.
3. **SQL** normalizado para 11 dígitos: tira o prefixo “00.” das planilhas de 2002–2010, repõe zeros que o
   Excel apagou, recupera o primeiro SQL quando o Excel transformou “SQL,SQL” em número decimal e separa os
   códigos **INCRA** (área rural, sem lote fiscal).
4. **Localização** pelo WFS do GeoSampa:
   - `lote_cidadao` (setor + quadra + lote) → centróide do lote, endereço e uso no IPTU;
   - quando o lote não existe mais (remembramento, condomínio), `quadra_fiscal` → centro da quadra;
   - sem SQL utilizável (2000–2001 não têm SQL; INCRA; SQL inválido) → **endereço** da planilha no cadastro de
     lotes (`nm_logradouro_completo` + `cd_numero_porta`): mesmo número ou, se não houver, o número mais próximo
     (mesmo lado da rua, até 60 números). Ruas homônimas são desempatadas pela regional/subprefeitura da planilha.

   O cartão do ponto e o CSV dizem qual foi usado (`precisao` = `lote`, `quadra`, `endereco` ou `rua`).
5. **Distrito, subprefeitura e região** por ponto-em-polígono (`distrito_municipal`, `subprefeitura`).

| Ano | Fontes | Registros | No mapa | Por lote | Por quadra | Por endereço | Sem localização |
|---|---|---:|---:|---:|---:|---:|---:|
| 2000 | SEHAB/SMUL | 4.087 | 3.419 | 0 | 0 | 3.419 | 668 |
| 2001 | SEHAB/SMUL | 4.433 | 3.776 | 0 | 0 | 3.776 | 657 |
| 2002 | SEHAB/SMUL | 3.303 | 3.195 | 1.207 | 1.448 | 540 | 108 |
| 2003 | SEHAB/SMUL | 2.726 | 2.690 | 1.131 | 1.551 | 8 | 36 |
| 2004 | SEHAB/SMUL | 2.382 | 2.291 | 889 | 1.395 | 7 | 91 |
| 2005 | SEHAB/SMUL | 1.974 | 1.948 | 824 | 1.107 | 17 | 26 |
| 2006 | SEHAB/SMUL | 2.040 | 2.012 | 809 | 1.193 | 10 | 28 |
| 2007 | SEHAB/SMUL | 1.758 | 1.738 | 632 | 1.098 | 8 | 20 |
| 2008 | SEHAB/SMUL | 1.883 | 1.872 | 591 | 1.275 | 6 | 11 |
| 2009 | SEHAB/SMUL | 1.759 | 1.747 | 473 | 1.260 | 14 | 12 |
| 2010 | SEHAB/SMUL | 1.818 | 1.795 | 448 | 1.337 | 10 | 23 |
| 2011 | SEHAB/SMUL | 3.005 | 2.967 | 969 | 1.992 | 6 | 38 |
| 2012 | SEHAB/SMUL | 2.612 | 2.593 | 760 | 1.813 | 20 | 19 |
| 2013 | SEHAB/SMUL | 1.282 | 1.275 | 273 | 972 | 30 | 7 |
| 2014 | SEHAB/SMUL | 2.023 | 2.009 | 623 | 1.369 | 17 | 14 |
| 2015 | SEHAB/SMUL | 1.705 | 1.692 | 654 | 1.012 | 26 | 13 |
| 2016 | SEHAB/SMUL | 5.528 | 5.086 | 3.051 | 1.965 | 70 | 442 |
| 2017 | SEHAB/SMUL | 5.214 | 5.053 | 3.038 | 1.872 | 143 | 161 |
| 2018 | SEHAB/SMUL | 3.980 | 3.877 | 2.148 | 1.660 | 69 | 103 |
| 2019 | SEHAB/SMUL | 5.381 | 5.266 | 3.093 | 2.086 | 87 | 115 |
| 2020 | SEHAB/SMUL | 3.456 | 3.428 | 1.569 | 1.833 | 26 | 28 |
| 2021 | SEHAB/SMUL | 2.803 | 2.787 | 1.355 | 1.424 | 8 | 16 |
| 2022 | SEHAB/SMUL + Aprova Digital | 4.576 | 4.521 | 2.403 | 2.063 | 55 | 55 |
| 2023 | Aprova Digital | 2.792 | 2.074 | 1.150 | 924 | 0 | 718 |
| 2024 | SEHAB/SMUL | 1.626 | 1.568 | 1.183 | 334 | 51 | 58 |
| 2025 | SEHAB/SMUL | 1.331 | 1.274 | 1.015 | 220 | 39 | 57 |
| 2026 (jan–out) | SEHAB/SMUL + Aprova Digital | 2.799 | 2.099 | 1.870 | 199 | 30 | 700 |
| **Total** | | **78.276** | **74.052** | 32.158 | 33.402 | 8.492 | 4.224 |

Os registros sem localização são sobretudo **certificados de conclusão do Aprova Digital** (vêm sem SQL) e, em 2000–2001,
endereços sem número ou de ruas que não existem mais no cadastro. Muitos lotes antigos já foram remembrados ou viraram
condomínio, por isso parte dos pontos cai no centro da quadra (diferença de dezenas de metros, irrelevante na escala da cidade).

**Comparações entre anos:** as planilhas não cobrem sempre os mesmos tipos de ato (por exemplo, 2013–2015 não trazem
regularizações nem certificados; 2016–2022 trazem muitos alvarás de autorização e de funcionamento). Para séries históricas,
use “Só obras” ou “Só edificação nova”, deixe o ato em “Emissão” e lembre que 2023 (sem SEHAB/SMUL) e 2024–2025 (sem
Aprova Digital) estão incompletos.

**Atenção:** cada símbolo é um **alvará**, não um empreendimento. O mesmo prédio pode ter alvará de aprovação,
depois de execução, apostilamentos e reconsiderações — use os filtros de etapa e ato para não contar duas vezes.

## Créditos e licenças

- Criado por **Shaiane Viana** — FAUUSP · LABAUT.
- Dados: Prefeitura de São Paulo — SEHAB/SMUL (processos aprovados), SMUL (Aprova Digital) e GeoSampa.
- Mapa de fundo: Esri World Light Gray Canvas (© Esri, © OpenStreetMap e GIS User Community).
- Mapa interativo: [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2), incluído em `assets/vendor/`.
- Fonte: Helvetica. O site usa a Helvetica instalada no computador de quem abre (Helvetica Neue no Mac;
  Helvetica / Helvetica Neue LT Std no Windows). Sem ela, cai para Arial. A fonte não é distribuída com o site
  porque é licenciada.

## Estrutura

```
index.html                          página
assets/app.js                       mapa, filtros, exportação PNG/CSV/GeoJSON
assets/style.css                    estilo (Helvetica)
assets/vendor/leaflet/              Leaflet
data/                               dados prontos para o site (gerados)
dados_brutos/processos_aprovados/   planilhas SEHAB/SMUL (PA_<ano>)
dados_brutos/aprova_digital/        planilhas do Aprova Digital (AD_<ano>)
scripts/build_data.js               processamento
scripts/serve.js                    servidor local
```
