"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "../../../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

const ETAPAS_FLUXO = [
  { nome: "Inserir Documentos", descricao: "Coleta e conferência da documentação necessária. 1 DIA" },
  { nome: "Vist. Agendada", descricao: "Vistoria técnica agendada no local da instalação. 3 DIAS" },
  { nome: "Layout", descricao: "Elaboração do layout e posicionamento dos módulos.2 DIAS" },
  { nome: "Orçamentos", descricao: "Levantamento e aprovação dos materiais do projeto. 2 DIAS" },
  { nome: "Lista CA", descricao: "Definição dos materiais elétricos de corrente alternada. 3 DIAS" },
  { nome: "Projeto", descricao: "Desenvolvimento do projeto executivo de engenharia. 10 DIAS" },
  { nome: "Homologação", descricao: "Solicitação e análise de parecer junto à concessionária. 2 DIAS" },
  { nome: "Compra CA", descricao: "Aquisição dos componentes elétricos de proteção e conexão. 7 DIAS" },
  { nome: "Aguardando Instalação", descricao: "Equipe e materiais programados para a montagem. 7 DIAS" },
  { nome: "Vist. Concessionária.", descricao: "Aguardando inspeção final da concessionária de energia. 2 DIAS" },
  { nome: "Troca Relogio", descricao: "Substituição do medidor para ativação do sistema solar. 7 DIAS" },
  { nome: "Finalizada", descricao: "Sistema concluído, homologado e em operação!" }
];

// Oculta etapas internas e mantém a linha do tempo contínua para o cliente
const mapearEtapaPublica = (etapaInterna: string) => {
  if (etapaInterna === "Pré Contrato Vist.") return "Inserir Documentos";
  if (etapaInterna === "Compra USINA") return "Homologação";
  if (etapaInterna === "Envio de Projetos") return "Compra CA";
  return etapaInterna;
};

interface DadosRastreio {
  numeroOS?: number;
  cliente?: string;
  etapa?: string;
  dataInstalacao?: string;
  atualizadoEm?: string;
}

function TelaCarregamento() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
      <p className="text-sm text-slate-600 font-medium">
        Carregando andamento da sua Ordem de Serviço...
      </p>
    </div>
  );
}

function AcompanharOSConteudo() {
  const params = useParams();
  const token =
    typeof params?.token === "string"
      ? params.token
      : Array.isArray(params?.token)
      ? params.token[0]
      : "";

  const [dados, setDados] = useState<DadosRastreio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  useEffect(() => {
    if (!token) {
      setCarregando(false);
      setNaoEncontrado(true);
      return;
    }

    const docRef = doc(db, "rastreio_publico", token);
    const unsub = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          setDados(snap.data() as DadosRastreio);
          setNaoEncontrado(false);
        } else {
          setDados(null);
          setNaoEncontrado(true);
        }
        setCarregando(false);
      },
      (error) => {
        console.error("Erro ao carregar rastreio:", error);
        setNaoEncontrado(true);
        setCarregando(false);
      }
    );

    return () => unsub();
  }, [token]);

  if (carregando) {
    return <TelaCarregamento />;
  }

  if (naoEncontrado || !dados) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="bg-white max-w-md w-full rounded-xl shadow-md border border-slate-200 p-6 text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold">
            !
          </div>
          <h1 className="text-lg font-bold text-slate-800 mb-1">
            Link inválido ou não encontrado
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Não foi possível localizar o acompanhamento para este código. Verifique se o link está completo ou solicite um novo acesso à equipe responsável.
          </p>
        </div>
      </div>
    );
  }

  const etapaBruta = dados.etapa || "Inserir Documentos";
  const etapaAtual = mapearEtapaPublica(etapaBruta);

  const isCancelada = etapaAtual === "Cancelada";
  const isAdiada = etapaAtual === "Adiada";
  const isFinalizada = etapaAtual === "Finalizada";

  const indiceAtual = ETAPAS_FLUXO.findIndex(
    (e) => e.nome.toLowerCase() === etapaAtual.toLowerCase()
  );

  const totalEtapas = ETAPAS_FLUXO.length;
  const progressoPercentual = isFinalizada
    ? 100
    : indiceAtual >= 0
    ? Math.round(((indiceAtual + 1) / totalEtapas) * 100)
    : 8;

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 font-sans text-slate-800">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Cabeçalho / Identificação do Projeto */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-900 to-blue-700 px-5 py-4 text-white">
            <p className="text-[11px] uppercase tracking-wider text-blue-200 font-semibold">
              Acompanhamento de Projeto Solar
            </p>
            <h1 className="text-lg font-bold mt-0.5 leading-snug">
              {dados.numeroOS ? `OS #${dados.numeroOS} — ` : ""}
              {dados.cliente || "Cliente"}
            </h1>
          </div>

          <div className="p-5 space-y-4">
            {/* Status em Destaque */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div>
                <span className="text-[11px] text-slate-500 block font-medium">Status Atual</span>
                <span
                  className={`text-sm font-bold ${
                    isFinalizada
                      ? "text-emerald-700"
                      : isCancelada
                      ? "text-red-700"
                      : isAdiada
                      ? "text-amber-700"
                      : "text-blue-800"
                  }`}
                >
                  {etapaAtual}
                </span>
              </div>

              {dados.dataInstalacao && !isCancelada && (
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 block font-medium">
                    Previsão de Instalação
                  </span>
                  <span className="text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded border border-slate-200 inline-block mt-0.5">
                    📅 {new Date(dados.dataInstalacao + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
              )}
            </div>

            {/* Avisos Especiais (Adiada ou Cancelada) */}
            {isAdiada && (
              <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-lg text-xs">
                <p className="font-bold">⏳ Etapa temporariamente adiada</p>
                <p className="mt-0.5 text-[11px]">
                  Seu projeto está aguardando reagendamento ou liberação técnica para seguir para a próxima etapa.
                </p>
              </div>
            )}

            {isCancelada && (
              <div className="bg-red-50 border border-red-300 text-red-900 p-3 rounded-lg text-xs">
                <p className="font-bold">❌ Ordem de Serviço Cancelada</p>
                <p className="mt-0.5 text-[11px]">
                  Esta Ordem de Serviço foi encerrada como cancelada. Em caso de dúvidas, entre em contato com nossa equipe.
                </p>
              </div>
            )}

            {/* Barra de Progresso */}
            {!isCancelada && (
              <div>
                <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                  <span>Progresso Geral</span>
                  <span>{progressoPercentual}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      isFinalizada ? "bg-emerald-600" : "bg-blue-600"
                    }`}
                    style={{ width: `${progressoPercentual}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Linha do Tempo das Etapas */}
        {!isCancelada && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
              Etapas do Projeto
            </h2>

            <div className="relative pl-6 space-y-5 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {ETAPAS_FLUXO.map((etapa, index) => {
                const concluida = isFinalizada || (indiceAtual >= 0 && index < indiceAtual);
                const atual = !isFinalizada && indiceAtual === index;

                return (
                  <div key={etapa.nome} className="relative">
                    {/* Bolinha indicadora */}
                    <span
                      className={`absolute -left-6 top-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
                        concluida
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : atual
                          ? "bg-blue-600 border-blue-200 text-white ring-4 ring-blue-100"
                          : "bg-white border-slate-300 text-slate-400"
                      }`}
                    >
                      {concluida ? "✓" : index + 1}
                    </span>

                    <div
                      className={`rounded-lg p-2.5 border transition-all ${
                        atual
                          ? "bg-blue-50/80 border-blue-300 shadow-sm"
                          : concluida
                          ? "bg-emerald-50/30 border-emerald-100"
                          : "bg-white border-transparent opacity-65"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs font-bold ${
                            atual
                              ? "text-blue-900"
                              : concluida
                              ? "text-emerald-900"
                              : "text-slate-600"
                          }`}
                        >
                          {etapa.nome}
                        </p>
                        {atual && (
                          <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shrink-0">
                            Etapa Atual
                          </span>
                        )}
                        {concluida && !atual && (
                          <span className="text-[10px] font-semibold text-emerald-700 shrink-0">
                            Concluída
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {etapa.descricao}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Rodapé informativo */}
        <p className="text-center text-[11px] text-slate-400 pb-4">
          Atualização automática em tempo real • SGE Engenharia
        </p>
      </div>
    </div>
  );
}

export default function AcompanharOSPage() {
  return (
    <Suspense fallback={<TelaCarregamento />}>
      <AcompanharOSConteudo />
    </Suspense>
  );
}