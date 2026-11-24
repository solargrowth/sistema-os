"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "../../../lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

const ETAPAS_FLUXO = [
  {
    nome: "Contrato",
    diasUteis: 1,
    descricao: "Formalização do contrato, conferência documental e agendamento da vistoria técnica."
  },
  {
    nome: "Desenvolvimento de Projeto",
    diasUteis: 10,
    descricao: "Vistoria técnica, definição de layout, dimensionamento e elaboração do projeto executivo."
  },
  {
    nome: "Homologação",
    diasUteis: 10,
    descricao: "Submissão e análise de parecer de acesso junto à concessionária de energia."
  },
  {
    nome: "Entrega de Equipamentos",
    diasUteis: 7,
    descricao: "Aquisição, faturamento e logística de entrega dos equipamentos no local da instalação."
  },
  {
    nome: "Instalação",
    diasUteis: 7,
    descricao: "Montagem dos módulos fotovoltaicos, inversor e adequações elétricas pela equipe técnica."
  },
  {
    nome: "Troca de Relógio",
    diasUteis: 12,
    descricao: "Vistoria final da concessionária e substituição do medidor para ativação do sistema."
  },
  {
    nome: "Finalização",
    diasUteis: 0,
    descricao: "Projeto concluído, homologado e em operação!"
  }
];

// Mapeia as colunas internas do Kanban para os 7 status resumidos do cliente
const mapearEtapaPublica = (etapaInterna: string) => {
  switch (etapaInterna) {
    case "Pré Contrato Vist.":
    case "Inserir Documentos":
      return "Contrato";
    case "Vist. Agendada":
    case "Layout":
    case "Orçamentos":
    case "Lista CA":
    case "Projeto":
      return "Desenvolvimento de Projeto";
    case "Homologação":
    case "Compra USINA":
      return "Homologação";
    case "Compra CA":
    case "Envio de Projetos":
      return "Entrega de Equipamentos";
    case "Aguardando Instalação":
      return "Instalação";
    case "Vist. Concessionária.":
    case "Troca Relogio":
      return "Troca de Relógio";
    case "Finalizada":
      return "Finalização";
    default:
      return etapaInterna;
  }
};

// Soma dias úteis (ignorando sábados e domingos) a partir de uma data base
const adicionarDiasUteis = (dataBase: Date, diasUteis: number): Date => {
  const resultado = new Date(dataBase.getTime());
  let adicionados = 0;

  while (adicionados < diasUteis) {
    resultado.setDate(resultado.getDate() + 1);
    const diaSemana = resultado.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      adicionados++;
    }
  }

  return resultado;
};

const normalizarDataLocal = (isoOuData?: string): Date => {
  if (!isoOuData) return new Date();
  if (isoOuData.length === 10 && isoOuData.includes("-")) {
    return new Date(`${isoOuData}T12:00:00`);
  }
  const d = new Date(isoOuData);
  return isNaN(d.getTime()) ? new Date() : d;
};

const formatarDataBR = (data: Date): string => {
  return data.toLocaleDateString("pt-BR");
};

interface DadosRastreio {
  numeroOS?: number;
  cliente?: string;
  etapa?: string;
  dataInstalacao?: string;
  dataCriacao?: string;
  dataFinalizacao?: string;
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

  const etapaBruta = dados.etapa || "Pré Contrato Vist.";
  const etapaAtual = mapearEtapaPublica(etapaBruta);

  const isCancelada = etapaAtual === "Cancelada";
  const isAdiada = etapaAtual === "Adiada";
  const isFinalizada = etapaAtual === "Finalização";

  // Calcula a linha do tempo de datas previstas em dias úteis a partir da criação da OS
  const dataCriacaoObj = normalizarDataLocal(dados.dataCriacao || dados.atualizadoEm);
  let cursorData = new Date(dataCriacaoObj.getTime());

  const etapasComPrevisao = ETAPAS_FLUXO.map((etapa) => {
    if (etapa.diasUteis > 0) {
      cursorData = adicionarDiasUteis(cursorData, etapa.diasUteis);
    }
    return {
      ...etapa,
      dataPrevisao: new Date(cursorData.getTime())
    };
  });

  const dataPrevisaoFinal = etapasComPrevisao[etapasComPrevisao.length - 1].dataPrevisao;

  const indiceAtual = etapasComPrevisao.findIndex(
    (e) => e.nome.toLowerCase() === etapaAtual.toLowerCase()
  );

  const totalEtapas = etapasComPrevisao.length;
  const progressoPercentual = isFinalizada
    ? 100
    : indiceAtual >= 0
    ? Math.round(((indiceAtual + 1) / totalEtapas) * 100)
    : 14;

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
            <p className="text-[11px] text-blue-100 mt-1">
              Início do processo (criação): <strong>{formatarDataBR(dataCriacaoObj)}</strong>
            </p>
          </div>

          <div className="p-5 space-y-4">
            {/* Status Atual e Previsão de Término */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
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

              {!isCancelada && (
                <div className="sm:text-right">
                  <span className="text-[11px] text-slate-500 block font-medium">
                    {isFinalizada && dados.dataFinalizacao
                      ? "Concluído em"
                      : "Previsão de Término do Projeto"}
                  </span>
                  <span className="text-xs font-bold text-slate-800 bg-white px-2.5 py-1 rounded border border-slate-200 inline-block mt-0.5">
                    📅{" "}
                    {isFinalizada && dados.dataFinalizacao
                      ? formatarDataBR(normalizarDataLocal(dados.dataFinalizacao))
                      : formatarDataBR(dataPrevisaoFinal)}
                  </span>
                </div>
              )}
            </div>

            {/* Previsão específica de Instalação quando agendada */}
            {dados.dataInstalacao && !isCancelada && (
              <div className="flex items-center justify-between bg-indigo-50/70 border border-indigo-200 px-3.5 py-2 rounded-lg text-xs">
                <span className="font-semibold text-indigo-900">Data prevista para instalação:</span>
                <span className="font-bold text-indigo-800">
                  🛠️ {formatarDataBR(normalizarDataLocal(dados.dataInstalacao))}
                </span>
              </div>
            )}

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

        {/* Linha do Tempo das 7 Etapas */}
        {!isCancelada && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Etapas do Projeto
              </h2>
              <span className="text-[10px] text-slate-400 font-medium">
                Prazos estimados em dias úteis
              </span>
            </div>

            <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {etapasComPrevisao.map((etapa, index) => {
                const concluida = isFinalizada || (indiceAtual >= 0 && index < indiceAtual);
                const atual = !isFinalizada && indiceAtual === index;
                const isUltima = etapa.nome === "Finalização";

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
                      className={`rounded-lg p-3 border transition-all ${
                        atual
                          ? "bg-blue-50/80 border-blue-300 shadow-sm"
                          : concluida
                          ? "bg-emerald-50/30 border-emerald-100"
                          : "bg-white border-slate-100 opacity-75"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs font-bold ${
                            atual
                              ? "text-blue-900"
                              : concluida
                              ? "text-emerald-900"
                              : "text-slate-700"
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

                      <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                        {etapa.descricao}
                      </p>

                      {/* Previsão de término da etapa */}
                      <div className="mt-2 pt-1.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                        <span className="font-semibold text-slate-600">
                          {isUltima
                            ? "Previsão de término total:"
                            : "Previsão de término da etapa:"}{" "}
                          <strong className={atual ? "text-blue-800" : "text-slate-800"}>
                            {formatarDataBR(etapa.dataPrevisao)}
                          </strong>
                        </span>

                        {etapa.diasUteis > 0 && (
                          <span className="text-slate-400 font-medium">
                            ({etapa.diasUteis} {etapa.diasUteis === 1 ? "dia útil" : "dias úteis"})
                          </span>
                        )}
                      </div>
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