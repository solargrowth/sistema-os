"use client";

import { useState, useEffect, useRef } from "react";
import { auth, db, storage } from "../../lib/firebase";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { 
  collection, addDoc, onSnapshot, doc, updateDoc, arrayUnion, deleteDoc, setDoc 
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

// Grades atualizadas e reordenadas
const ETAPAS = [
  { nome: "Pré Contrato Vist.", cor: "bg-orange-50 border-orange-200 text-orange-800" },
  { nome: "Inserir Documentos", cor: "bg-slate-100 border-slate-200 text-slate-800" },
  { nome: "Vist. Agendada", cor: "bg-yellow-50 border-yellow-200 text-yellow-800" },
  { nome: "Layout", cor: "bg-lime-50 border-lime-200 text-lime-800" },
  { nome: "Orçamentos", cor: "bg-green-50 border-green-200 text-green-800" },
  { nome: "Lista CA", cor: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  { nome: "Projeto", cor: "bg-teal-50 border-teal-200 text-teal-800" },
  { nome: "Homologação", cor: "bg-cyan-50 border-cyan-200 text-cyan-800" },
  { nome: "Compra USINA", cor: "bg-sky-50 border-sky-200 text-sky-800" },
  { nome: "Compra CA", cor: "bg-blue-50 border-blue-200 text-blue-800" },
  { nome: "Envio de Projetos", cor: "bg-indigo-50 border-indigo-200 text-indigo-800" },
  { nome: "Aguardando Instalação", cor: "bg-violet-50 border-violet-200 text-violet-800" },
  { nome: "Vist. Concessionária.", cor: "bg-purple-50 border-purple-200 text-purple-800" },
  { nome: "Troca Relogio", cor: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800" },
  { nome: "Adiada", cor: "bg-rose-50 border-rose-200 text-rose-800" }
];

const isDataAtrasada = (dataStr: string) => {
  if (!dataStr) return false;
  return dataStr < new Date().toISOString().split("T")[0];
};

const formatarDataHora = (isoStr: string) => {
  const d = new Date(isoStr);
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR");
};

const parseMonetario = (valor: string | number) => {
  if (!valor) return 0;
  if (typeof valor === "number") return valor;
  const str = valor.toString().trim();
  if (str.includes(",")) {
    return parseFloat(str.replace(/\./g, "").replace(",", ".")) || 0;
  }
  return parseFloat(str) || 0;
};

const formatarMoedaBR = (num: number) => {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

const mascaraMoeda = (valor: string) => {
  const apenasNumeros = valor.replace(/\D/g, '');
  if (!apenasNumeros) return '';
  const num = parseFloat(apenasNumeros) / 100;
  return formatarMoedaBR(num);
};

// Máscara automática para formatar DIA/MÊS (ex: 25/11)
const mascaraDiaMes = (valor: string) => {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 4);
  if (apenasNumeros.length >= 3) {
    return `${apenasNumeros.slice(0, 2)}/${apenasNumeros.slice(2)}`;
  }
  return apenasNumeros;
};

// Converte "DD/MM" em chave "MM-DD" para ordenar cronologicamente
const chaveOrdenacaoDiaMes = (ddmm: string) => {
  if (!ddmm || !ddmm.includes("/")) return "99-99";
  const [d, m] = ddmm.split("/");
  return `${ (m || "99").padStart(2, "0") }-${ (d || "99").padStart(2, "0") }`;
};

// Gera token aleatório único para o link público do cliente
const gerarTokenRastreio = () => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  const array = new Uint32Array(18);
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(array);
    for (let i = 0; i < array.length; i++) {
      token += chars[array[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 18; i++) {
      token += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return token;
};

const IconeCheck = () => <svg className="w-3.5 h-3.5 text-green-600 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>;
const IconeCancel = () => <svg className="w-3.5 h-3.5 text-red-600 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>;
const IconeLivro = () => <svg className="w-3.5 h-3.5 text-gray-700 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>;
const IconeGrafico = () => <svg className="w-3.5 h-3.5 text-blue-600 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>;
const IconeClipe = () => <svg className="w-3.5 h-3.5 text-gray-800 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>;
const IconeLapis = () => <svg className="w-3.5 h-3.5 text-orange-600 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>;
const IconeLixeira = () => <svg className="w-3.5 h-3.5 text-red-700 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>;
const IconeRepatriar = () => <svg className="w-3.5 h-3.5 text-gray-700 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"></path></svg>;
const IconeLupa = () => <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>;
const IconeLink = () => <svg className="w-3.5 h-3.5 text-indigo-600 hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>;

export default function Dashboard() {
  const router = useRouter();
  const [listaOS, setListaOS] = useState<any[]>([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [minimizados, setMinimizados] = useState<string[]>([]);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const [ultimaNotificacaoLida, setUltimaNotificacaoLida] = useState<string | null>(null);
  
  // Busca Global (Lupa)
  const [buscaModalAberto, setBuscaModalAberto] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  
  const [minFinalizadas, setMinFinalizadas] = useState(false);
  const [minCanceladas, setMinCanceladas] = useState(false);

  // Modais Secundários
  const [osHistorico, setOsHistorico] = useState<any | null>(null);
  const [osDashboard, setOsDashboard] = useState<any | null>(null);
  const [osAnexos, setOsAnexos] = useState<any | null>(null);
  const [osLinkModal, setOsLinkModal] = useState<{ os: any; url: string; copiado: boolean } | null>(null);
  
  // Estados para Upload Múltiplo e Exclusão de Anexos
  const [arquivosSelecionados, setArquivosSelecionados] = useState<File[]>([]);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [progressoAnexo, setProgressoAnexo] = useState("");
  const [excluindoAnexo, setExcluindoAnexo] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement | null>(null);
  
  const [osStatusModal, setOsStatusModal] = useState<{ id: string, acao: string, data: string } | null>(null);
  const [dreModal, setDreModal] = useState(false);
  const [instModal, setInstModal] = useState(false);
  const [vencModal, setVencModal] = useState<"PS" | "US" | "CA" | null>(null);

  // Filtros por Instalador nos Modais
  const [filtroInstaladorInst, setFiltroInstaladorInst] = useState("TODOS");
  const [filtroInstaladorVenc, setFiltroInstaladorVenc] = useState("TODOS");
  
  const [dreStart, setDreStart] = useState("");
  const [dreEnd, setDreEnd] = useState("");
  
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [osParaExcluir, setOsParaExcluir] = useState<string | null>(null);
  const [senhaExclusao, setSenhaExclusao] = useState("");
  
  const valorInicialOS = {
    cliente: "", endereco: "", clienteFinal: "", dataInstalacao: "", instalador: "", vistoriador: "", obs: "",
    modulos: "", inversor: "", notaTecnica: "", receita: "",
    valorCA: "", caCheck: false, caCheck1: false, caCheck2: false, dataCA1: "", dataCA2: "",
    valorPS: "", psCheck1: false, psCheck2: false, dataPS1: "", dataPS2: "",
    valorUS: "", usCheck: false, usCheck1: false, usCheck2: false, dataUS1: "", dataUS2: "",
    valorDMS: "", dmsCheck: false, numeroOS: 0, tokenRastreio: "", etapa: "Pré Contrato Vist."
  };

  const [novaOS, setNovaOS] = useState(valorInicialOS);

  const fazerLogout = async () => {
    await signOut(auth);
    router.push("/");
  };

  useEffect(() => {
    const notifSalva = localStorage.getItem("ultimaNotificacaoLida");
    if (notifSalva) setUltimaNotificacaoLida(notifSalva);

    const unsub = onSnapshot(collection(db, "ordens_servico"), (snapshot) => {
      const ordens = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setListaOS(ordens);
    });
    return () => unsub();
  }, []);

  // Sincroniza apenas os dados públicos não-sensíveis para o link do cliente
  const sincronizarRastreioPublico = async (
    token: string,
    dados: { numeroOS?: number; cliente?: string; etapa?: string; dataInstalacao?: string }
  ) => {
    if (!token) return;
    try {
      await setDoc(
        doc(db, "rastreio_publico", token),
        {
          numeroOS: dados.numeroOS || 0,
          cliente: dados.cliente || "",
          etapa: dados.etapa || "Pré Contrato Vist.",
          dataInstalacao: dados.dataInstalacao || "",
          atualizadoEm: new Date().toISOString()
        },
        { merge: true }
      );
    } catch (error) {
      console.error("Erro ao sincronizar rastreio público:", error);
    }
  };

  // Garante que a OS possua um token (inclusive OSs antigas) e abre o modal com o link público
  const abrirLinkCliente = async (os: any) => {
    try {
      let token = os.tokenRastreio;
      if (!token) {
        token = gerarTokenRastreio();
        await updateDoc(doc(db, "ordens_servico", os.id), {
          tokenRastreio: token
        });
      }

      await sincronizarRastreioPublico(token, {
        numeroOS: os.numeroOS,
        cliente: os.cliente,
        etapa: os.etapa,
        dataInstalacao: os.dataInstalacao
      });

      const origem = typeof window !== "undefined" ? window.location.origin : "";
      const urlPublica = `${origem}/acompanhar/${token}`;

      let copiou = false;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(urlPublica);
          copiou = true;
        } catch {
          copiou = false;
        }
      }

      setOsLinkModal({ os, url: urlPublica, copiado: copiou });
    } catch (error) {
      console.error("Erro ao gerar link do cliente:", error);
      alert("Não foi possível gerar o link de acompanhamento. Verifique as regras do Firestore.");
    }
  };

  const registrarAuditoria = (acao: string) => ({
    acao, data: new Date().toISOString(), usuario: auth.currentUser?.email || "Usuário"
  });

  const notificacoesGlobais = listaOS.flatMap(os => 
    (os.historico || []).map((h: any) => ({ ...h, cliente: os.cliente }))
  ).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 15);

  const dataMaisRecente = notificacoesGlobais.length > 0 ? notificacoesGlobais[0].data : null;
  const temNaoLidas = dataMaisRecente && dataMaisRecente !== ultimaNotificacaoLida;

  const marcarComoLidas = () => {
    if (dataMaisRecente) {
      setUltimaNotificacaoLida(dataMaisRecente);
      localStorage.setItem("ultimaNotificacaoLida", dataMaisRecente);
    }
  };

  const confirmarStatusComData = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!osStatusModal) return;
    try {
      const osAtual = listaOS.find(o => o.id === osStatusModal.id);
      const token = osAtual?.tokenRastreio || gerarTokenRastreio();
      const osRef = doc(db, "ordens_servico", osStatusModal.id);

      await updateDoc(osRef, { 
        etapa: osStatusModal.acao,
        dataFinalizacao: osStatusModal.data,
        tokenRastreio: token,
        historico: arrayUnion(registrarAuditoria(`Alterou status para: ${osStatusModal.acao} em ${osStatusModal.data}`))
      });

      if (osAtual) {
        await sincronizarRastreioPublico(token, {
          numeroOS: osAtual.numeroOS,
          cliente: osAtual.cliente,
          etapa: osStatusModal.acao,
          dataInstalacao: osAtual.dataInstalacao
        });
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao atualizar o status.");
    } finally {
      setOsStatusModal(null);
    }
  };

  const excluirOSDefinitivo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senhaExclusao === "*@Solar123" && osParaExcluir) {
      try {
        const osExcluida = listaOS.find(o => o.id === osParaExcluir);
        await deleteDoc(doc(db, "ordens_servico", osParaExcluir));
        if (osExcluida?.tokenRastreio) {
          await deleteDoc(doc(db, "rastreio_publico", osExcluida.tokenRastreio)).catch(() => {});
        }
        alert("Ordem de Serviço excluída com sucesso!");
      } catch (error) {
        console.error(error);
        alert("Erro ao excluir OS.");
      } finally {
        setOsParaExcluir(null);
        setSenhaExclusao("");
      }
    } else {
      alert("Senha incorreta! Exclusão bloqueada.");
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string, etapaAtual: string) => {
    e.dataTransfer.setData("osId", id);
    e.dataTransfer.setData("etapaAtual", etapaAtual);
  };

  const handleDrop = async (e: React.DragEvent, novaEtapa: string) => {
    e.preventDefault();
    const osId = e.dataTransfer.getData("osId");
    const etapaAtual = e.dataTransfer.getData("etapaAtual");
    if (osId && etapaAtual !== novaEtapa) {
      const osAtual = listaOS.find(o => o.id === osId);
      const token = osAtual?.tokenRastreio || gerarTokenRastreio();
      const osRef = doc(db, "ordens_servico", osId);

      await updateDoc(osRef, { 
        etapa: novaEtapa,
        tokenRastreio: token,
        historico: arrayUnion(registrarAuditoria(`Moveu de "${etapaAtual}" para "${novaEtapa}"`))
      });

      if (osAtual) {
        await sincronizarRastreioPublico(token, {
          numeroOS: osAtual.numeroOS,
          cliente: osAtual.cliente,
          etapa: novaEtapa,
          dataInstalacao: osAtual.dataInstalacao
        });
      }
    }
  };

  const abrirEdicaoOS = (os: any) => {
    setNovaOS({
      ...valorInicialOS,
      ...os,
      caCheck1: os.caCheck1 ?? os.caCheck ?? false,
      caCheck2: os.caCheck2 ?? os.caCheck ?? false,
      usCheck1: os.usCheck1 ?? os.usCheck ?? false,
      usCheck2: os.usCheck2 ?? os.usCheck ?? false,
    });
    setEditandoId(os.id);
    setModalAberto(true);
  };

  const salvarNovaOS = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editandoId) {
        const token = novaOS.tokenRastreio || gerarTokenRastreio();
        const osRef = doc(db, "ordens_servico", editandoId);
        await updateDoc(osRef, {
          ...novaOS,
          tokenRastreio: token,
          historico: arrayUnion(registrarAuditoria("Editou as informações da OS"))
        });

        await sincronizarRastreioPublico(token, {
          numeroOS: novaOS.numeroOS,
          cliente: novaOS.cliente,
          etapa: novaOS.etapa || "Pré Contrato Vist.",
          dataInstalacao: novaOS.dataInstalacao
        });
      } else {
        const proximoNumero = listaOS.length > 0 ? Math.max(...listaOS.map(o => o.numeroOS || 0)) + 1 : 1;
        const novoToken = gerarTokenRastreio();
        await addDoc(collection(db, "ordens_servico"), {
          ...novaOS,
          numeroOS: proximoNumero,
          tokenRastreio: novoToken,
          etapa: "Pré Contrato Vist.",
          dataCriacao: new Date().toISOString(),
          historico: [registrarAuditoria("Criou a OS")],
          anexos: []
        });

        await sincronizarRastreioPublico(novoToken, {
          numeroOS: proximoNumero,
          cliente: novaOS.cliente,
          etapa: "Pré Contrato Vist.",
          dataInstalacao: novaOS.dataInstalacao
        });
      }
      setNovaOS(valorInicialOS);
      setEditandoId(null);
    } catch (error) {
      console.error(error);
      alert("Erro ao salvar.");
    } finally {
      setModalAberto(false);
    }
  };

  const enviarAnexo = async () => {
    if (arquivosSelecionados.length > 0 && osAnexos) {
      setEnviandoAnexo(true);
      const novosAnexos: any[] = [];
      const novosHistoricos: any[] = [];

      try {
        for (let i = 0; i < arquivosSelecionados.length; i++) {
          const arquivo = arquivosSelecionados[i];
          const nomeArquivo = arquivo.name;
          setProgressoAnexo(`Enviando ${i + 1} de ${arquivosSelecionados.length}...`);

          const storageRef = ref(storage, `anexos_os/${osAnexos.id}/${nomeArquivo}`);
          await uploadBytes(storageRef, arquivo);
          const urlDownload = await getDownloadURL(storageRef);

          novosAnexos.push({
            nome: nomeArquivo,
            url: urlDownload,
            data: new Date().toISOString(),
            usuario: auth.currentUser?.email
          });

          novosHistoricos.push(registrarAuditoria(`Anexou arquivo: ${nomeArquivo}`));
        }

        const osRef = doc(db, "ordens_servico", osAnexos.id);
        await updateDoc(osRef, {
          anexos: arrayUnion(...novosAnexos),
          historico: arrayUnion(...novosHistoricos)
        });

        setOsAnexos({ ...osAnexos, anexos: [...(osAnexos.anexos || []), ...novosAnexos] });
        setArquivosSelecionados([]);
        if (inputArquivoRef.current) inputArquivoRef.current.value = "";
      } catch (error) {
        console.error("Erro ao salvar anexos", error);
        if (novosAnexos.length > 0) {
          const osRef = doc(db, "ordens_servico", osAnexos.id);
          await updateDoc(osRef, {
            anexos: arrayUnion(...novosAnexos),
            historico: arrayUnion(...novosHistoricos)
          }).catch(() => {});
          setOsAnexos({ ...osAnexos, anexos: [...(osAnexos.anexos || []), ...novosAnexos] });
        }
        alert("Erro ao fazer upload de um ou mais arquivos. Verifique sua conexão ou as regras do Storage.");
      } finally {
        setEnviandoAnexo(false);
        setProgressoAnexo("");
      }
    }
  };

  const excluirAnexo = async (arq: any) => {
    if (!osAnexos) return;
    if (!window.confirm(`Deseja realmente excluir o arquivo "${arq.nome}"?`)) return;

    const chaveItem = arq.data || arq.nome;
    setExcluindoAnexo(chaveItem);

    try {
      const storageRef = ref(storage, `anexos_os/${osAnexos.id}/${arq.nome}`);
      try {
        await deleteObject(storageRef);
      } catch (storageError: any) {
        if (storageError?.code !== "storage/object-not-found") {
          throw storageError;
        }
      }

      const anexosAtualizados = (osAnexos.anexos || []).filter(
        (item: any) => !(item.nome === arq.nome && item.data === arq.data)
      );

      const osRef = doc(db, "ordens_servico", osAnexos.id);
      await updateDoc(osRef, {
        anexos: anexosAtualizados,
        historico: arrayUnion(registrarAuditoria(`Excluiu arquivo: ${arq.nome}`))
      });

      setOsAnexos({ ...osAnexos, anexos: anexosAtualizados });
    } catch (error) {
      console.error("Erro ao excluir anexo:", error);
      alert("Não foi possível excluir o arquivo. Tente novamente.");
    } finally {
      setExcluindoAnexo(null);
    }
  };

  const toggleCheckboxCard = async (osId: string, campo: string, valorAtual: boolean) => {
    const osRef = doc(db, "ordens_servico", osId);
    await updateDoc(osRef, { [campo]: !valorAtual });
  };

  const toggleMinimizar = (etapa: string) => {
    setMinimizados(prev => prev.includes(etapa) ? prev.filter(e => e !== etapa) : [...prev, etapa]);
  };

  const repatriarOS = async (osId: string) => {
    const osAtual = listaOS.find(o => o.id === osId);
    const token = osAtual?.tokenRastreio || gerarTokenRastreio();
    const osRef = doc(db, "ordens_servico", osId);

    await updateDoc(osRef, { 
      etapa: "Inserir Documentos",
      tokenRastreio: token,
      historico: arrayUnion(registrarAuditoria(`Repatriou a OS para "Inserir Documentos"`))
    });

    if (osAtual) {
      await sincronizarRastreioPublico(token, {
        numeroOS: osAtual.numeroOS,
        cliente: osAtual.cliente,
        etapa: "Inserir Documentos",
        dataInstalacao: osAtual.dataInstalacao
      });
    }
  };

  const abrirDRE = () => {
    setDreStart("");
    setDreEnd("");
    setDreModal(true);
  };

  const setSemanaPassada = () => {
    const hoje = new Date();
    const diaSemana = hoje.getDay();
    const diasParaDomingo = diaSemana === 0 ? 7 : diaSemana;
    const ultimoDomingo = new Date(hoje);
    ultimoDomingo.setDate(hoje.getDate() - diasParaDomingo);
    const ultimaSegunda = new Date(ultimoDomingo);
    ultimaSegunda.setDate(ultimoDomingo.getDate() - 6);
    setDreStart(ultimaSegunda.toISOString().split("T")[0]);
    setDreEnd(ultimoDomingo.toISOString().split("T")[0]);
  };

  const setMesPassado = () => {
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    setDreStart(primeiroDia.toISOString().split("T")[0]);
    setDreEnd(ultimoDia.toISOString().split("T")[0]);
  };

  const calcularDRE = () => {
    const osValidas = listaOS.filter(os => 
      os.etapa === "Finalizada" && 
      os.dataFinalizacao && 
      os.dataFinalizacao >= dreStart && 
      os.dataFinalizacao <= dreEnd
    );

    let totalReceita = 0; let totalCusto = 0;
    
    const detalhamento = osValidas.map(os => {
      const ca = parseMonetario(os.valorCA);
      const ps = parseMonetario(os.valorPS);
      const us = parseMonetario(os.valorUS);
      const dms = parseMonetario(os.valorDMS);
      const rec = parseMonetario(os.receita);
      
      const custo = ca + ps + us + dms;
      const lucro = rec - custo;
      const margem = rec > 0 ? (lucro / rec) * 100 : 0;

      totalReceita += rec;
      totalCusto += custo;

      return {
        cliente: os.cliente,
        numeroOS: os.numeroOS,
        dataFinalizacao: os.dataFinalizacao,
        ca, ps, us, dms, rec, custo, lucro, margem
      };
    });

    const lucroTotal = totalReceita - totalCusto;
    const margemTotal = totalReceita > 0 ? (lucroTotal / totalReceita) * 100 : 0;

    return { qtde: osValidas.length, totalReceita, totalCusto, lucroTotal, margemTotal, detalhamento };
  };

  const dre = calcularDRE();

  // Filtra apenas os grids: Adiada, Aguardando Instalação, Compra CA e Envio de Projetos
  const getProximasInstalacoesBase = () => {
    const etapasPermitidas = [
      "Adiada",
      "Aguardando Instalação",
      "Compra CA",
      "Envio de Projetos"
    ];

    return listaOS
      .filter(os => etapasPermitidas.includes(os.etapa) && os.dataInstalacao)
      .sort((a, b) => a.dataInstalacao.localeCompare(b.dataInstalacao));
  };
  const proximasInstalacoesBase = getProximasInstalacoesBase();

  const instaladoresDisponiveisInst = Array.from(
    new Set(
      proximasInstalacoesBase
        .map(os => (os.instalador || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const proximasInstalacoes = proximasInstalacoesBase.filter(os => {
    if (filtroInstaladorInst === "TODOS") return true;
    return (os.instalador || "").trim().toLowerCase() === filtroInstaladorInst.toLowerCase();
  });

  // Filtra os vencimentos em aberto (não marcados no checkbox) para PS, US ou CA e divide o valor total por 2
  const getVencimentosAbertosBase = (tipo: "PS" | "US" | "CA" | null) => {
    if (!tipo) return [];
    const osAtivas = listaOS.filter(os => os.etapa !== "Cancelada");
    const itens: any[] = [];

    osAtivas.forEach(os => {
      if (tipo === "PS") {
        const metadePS = formatarMoedaBR(parseMonetario(os.valorPS) / 2);
        if (os.dataPS1 && !os.psCheck1) {
          itens.push({ id: os.id, numeroOS: os.numeroOS, cliente: os.cliente, clienteFinal: os.clienteFinal || "-", instalador: os.instalador || "", vistoriador: os.vistoriador || "-", etapa: os.etapa, valorParcela: metadePS, valorTotal: formatarMoedaBR(parseMonetario(os.valorPS)), dataVenc: os.dataPS1, parcela: "1ª Parcela (50%)", campoCheck: "psCheck1", valorCheckAtual: !!os.psCheck1 });
        }
        if (os.dataPS2 && !os.psCheck2) {
          itens.push({ id: os.id, numeroOS: os.numeroOS, cliente: os.cliente, clienteFinal: os.clienteFinal || "-", instalador: os.instalador || "", vistoriador: os.vistoriador || "-", etapa: os.etapa, valorParcela: metadePS, valorTotal: formatarMoedaBR(parseMonetario(os.valorPS)), dataVenc: os.dataPS2, parcela: "2ª Parcela (50%)", campoCheck: "psCheck2", valorCheckAtual: !!os.psCheck2 });
        }
      } else if (tipo === "US") {
        const metadeUS = formatarMoedaBR(parseMonetario(os.valorUS) / 2);
        const checkUS1 = os.usCheck1 ?? os.usCheck ?? false;
        const checkUS2 = os.usCheck2 ?? os.usCheck ?? false;
        if (os.dataUS1 && !checkUS1) {
          itens.push({ id: os.id, numeroOS: os.numeroOS, cliente: os.cliente, clienteFinal: os.clienteFinal || "-", instalador: os.instalador || "", vistoriador: os.vistoriador || "-", etapa: os.etapa, valorParcela: metadeUS, valorTotal: formatarMoedaBR(parseMonetario(os.valorUS)), dataVenc: os.dataUS1, parcela: "1ª Parcela (50%)", campoCheck: "usCheck1", valorCheckAtual: !!checkUS1 });
        }
        if (os.dataUS2 && !checkUS2) {
          itens.push({ id: os.id, numeroOS: os.numeroOS, cliente: os.cliente, clienteFinal: os.clienteFinal || "-", instalador: os.instalador || "", vistoriador: os.vistoriador || "-", etapa: os.etapa, valorParcela: metadeUS, valorTotal: formatarMoedaBR(parseMonetario(os.valorUS)), dataVenc: os.dataUS2, parcela: "2ª Parcela (50%)", campoCheck: "usCheck2", valorCheckAtual: !!checkUS2 });
        }
      } else if (tipo === "CA") {
        const metadeCA = formatarMoedaBR(parseMonetario(os.valorCA) / 2);
        const checkCA1 = os.caCheck1 ?? os.caCheck ?? false;
        const checkCA2 = os.caCheck2 ?? os.caCheck ?? false;
        if (os.dataCA1 && !checkCA1) {
          itens.push({ id: os.id, numeroOS: os.numeroOS, cliente: os.cliente, clienteFinal: os.clienteFinal || "-", instalador: os.instalador || "", vistoriador: os.vistoriador || "-", etapa: os.etapa, valorParcela: metadeCA, valorTotal: formatarMoedaBR(parseMonetario(os.valorCA)), dataVenc: os.dataCA1, parcela: "1ª Parcela (50%)", campoCheck: "caCheck1", valorCheckAtual: !!checkCA1 });
        }
        if (os.dataCA2 && !checkCA2) {
          itens.push({ id: os.id, numeroOS: os.numeroOS, cliente: os.cliente, clienteFinal: os.clienteFinal || "-", instalador: os.instalador || "", vistoriador: os.vistoriador || "-", etapa: os.etapa, valorParcela: metadeCA, valorTotal: formatarMoedaBR(parseMonetario(os.valorCA)), dataVenc: os.dataCA2, parcela: "2ª Parcela (50%)", campoCheck: "caCheck2", valorCheckAtual: !!checkCA2 });
        }
      }
    });

    return itens.sort((a, b) => chaveOrdenacaoDiaMes(a.dataVenc).localeCompare(chaveOrdenacaoDiaMes(b.dataVenc)));
  };

  const vencimentosAbertosBase = getVencimentosAbertosBase(vencModal);

  const instaladoresDisponiveisVenc = Array.from(
    new Set(
      vencimentosAbertosBase
        .map(item => (item.instalador || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));

  const vencimentosAbertos = vencimentosAbertosBase.filter(item => {
    if (vencModal !== "PS" || filtroInstaladorVenc === "TODOS") return true;
    return (item.instalador || "").trim().toLowerCase() === filtroInstaladorVenc.toLowerCase();
  });

  // Pesquisa Global nas OSs
  const resultadosBusca = (() => {
    const q = termoBusca.trim().toLowerCase();
    if (!q) return [];
    return listaOS
      .filter(os => {
        const campos = [
          os.numeroOS ? `os ${os.numeroOS}` : "",
          os.numeroOS?.toString() || "",
          os.cliente || "",
          os.clienteFinal || "",
          os.endereco || "",
          os.instalador || "",
          os.vistoriador || "",
          os.obs || "",
          os.modulos || "",
          os.inversor || "",
          os.notaTecnica || "",
          os.etapa || "",
          os.valorCA || "",
          os.valorPS || "",
          os.valorUS || "",
          os.valorDMS || "",
          os.receita || "",
          os.dataCA1 || "",
          os.dataCA2 || "",
          os.dataPS1 || "",
          os.dataPS2 || "",
          os.dataUS1 || "",
          os.dataUS2 || "",
          os.dataInstalacao ? new Date(os.dataInstalacao + "T12:00:00").toLocaleDateString("pt-BR") : ""
        ];
        return campos.some(c => c.toLowerCase().includes(q));
      })
      .sort((a, b) => (b.numeroOS || 0) - (a.numeroOS || 0));
  })();

  const OsCard = ({ os }: { os: any }) => {
    const [expandido, setExpandido] = useState(false);
    const atrasada = isDataAtrasada(os.dataInstalacao);

    const checkCA1 = os.caCheck1 ?? os.caCheck ?? false;
    const checkCA2 = os.caCheck2 ?? os.caCheck ?? false;
    const checkUS1 = os.usCheck1 ?? os.usCheck ?? false;
    const checkUS2 = os.usCheck2 ?? os.usCheck ?? false;

    return (
      <div 
        draggable 
        onDragStart={(e) => handleDragStart(e, os.id, os.etapa)}
        className="bg-white p-2 rounded shadow-sm border border-gray-200 cursor-grab mb-2 hover:shadow-md transition text-[10px]"
      >
        <div className="mb-1">
          <p className="font-bold text-[11px] text-blue-900 leading-tight" title={os.cliente}>
            {os.numeroOS ? `OS ${os.numeroOS} - ` : ""}{os.cliente}
          </p>
        </div>

        <div className="text-gray-800 space-y-[2px]">
          <p className="truncate" title={os.endereco}><span className="font-semibold">Endereço:</span> {os.endereco}</p>
          <p><span className="font-semibold">Cliente Final:</span> {os.clienteFinal}</p>
          <p className={atrasada ? "text-red-600 font-bold" : ""}>
            <span className="font-semibold text-gray-800">Data Inst.:</span> {os.dataInstalacao ? new Date(os.dataInstalacao + "T12:00:00").toLocaleDateString('pt-BR') : "-"}
          </p>
          <p><span className="font-semibold">Instalador:</span> {os.instalador}</p>
          <p className="truncate" title={os.obs}><span className="font-semibold">Obs:</span> {os.obs}</p>
        </div>

        {expandido && (
          <div className="mt-2 pt-2 border-t border-gray-100 text-gray-700 space-y-[2px] bg-gray-50 p-1 rounded">
            {os.vistoriador && <p><span className="font-semibold">Vistoriador:</span> {os.vistoriador}</p>}
            <p><span className="font-semibold">Módulos:</span> {os.modulos}</p>
            <p><span className="font-semibold">Inversor:</span> {os.inversor}</p>
            <p><span className="font-semibold">Nota Técnica:</span> {os.notaTecnica}</p>
            
            {/* Linha Valor CA + 2 Checkboxes e Datas compactas */}
            <div className="flex items-center justify-between gap-0.5 mt-1 border-t pt-1">
              <div className="flex items-center gap-0.5 min-w-0">
                <input type="checkbox" title="CA 1" checked={!!checkCA1} onChange={() => toggleCheckboxCard(os.id, "caCheck1", !!checkCA1)} className="w-3 h-3 shrink-0" />
                <input type="checkbox" title="CA 2" checked={!!checkCA2} onChange={() => toggleCheckboxCard(os.id, "caCheck2", !!checkCA2)} className="w-3 h-3 shrink-0" />
                <p className="text-[9.5px] tracking-tight whitespace-nowrap ml-0.5"><span className="font-semibold">Valor CA:</span> R$ {os.valorCA || "0,00"}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {os.dataCA1 && (
                  <span className={`text-[8px] px-0.5 py-[1px] rounded font-mono leading-none tracking-tighter ${checkCA1 ? "bg-gray-700 text-gray-300 line-through" : "bg-amber-100 text-amber-900 font-semibold border border-amber-300"}`}>
                    {os.dataCA1}
                  </span>
                )}
                {os.dataCA2 && (
                  <span className={`text-[8px] px-0.5 py-[1px] rounded font-mono leading-none tracking-tighter ${checkCA2 ? "bg-gray-700 text-gray-300 line-through" : "bg-amber-100 text-amber-900 font-semibold border border-amber-300"}`}>
                    {os.dataCA2}
                  </span>
                )}
              </div>
            </div>

            {/* Linha Valor PS + 2 Checkboxes e Datas compactas */}
            <div className="flex items-center justify-between gap-0.5">
              <div className="flex items-center gap-0.5 min-w-0">
                <input type="checkbox" title="PS 1" checked={!!os.psCheck1} onChange={() => toggleCheckboxCard(os.id, "psCheck1", !!os.psCheck1)} className="w-3 h-3 shrink-0" />
                <input type="checkbox" title="PS 2" checked={!!os.psCheck2} onChange={() => toggleCheckboxCard(os.id, "psCheck2", !!os.psCheck2)} className="w-3 h-3 shrink-0" />
                <p className="text-[9.5px] tracking-tight whitespace-nowrap ml-0.5"><span className="font-semibold">Valor PS:</span> R$ {os.valorPS || "0,00"}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {os.dataPS1 && (
                  <span className={`text-[8px] px-0.5 py-[1px] rounded font-mono leading-none tracking-tighter ${os.psCheck1 ? "bg-gray-700 text-gray-300 line-through" : "bg-amber-100 text-amber-900 font-semibold border border-amber-300"}`}>
                    {os.dataPS1}
                  </span>
                )}
                {os.dataPS2 && (
                  <span className={`text-[8px] px-0.5 py-[1px] rounded font-mono leading-none tracking-tighter ${os.psCheck2 ? "bg-gray-700 text-gray-300 line-through" : "bg-amber-100 text-amber-900 font-semibold border border-amber-300"}`}>
                    {os.dataPS2}
                  </span>
                )}
              </div>
            </div>

            {/* Linha Valor US + 2 Checkboxes e Datas compactas */}
            <div className="flex items-center justify-between gap-0.5">
              <div className="flex items-center gap-0.5 min-w-0">
                <input type="checkbox" title="US 1" checked={!!checkUS1} onChange={() => toggleCheckboxCard(os.id, "usCheck1", !!checkUS1)} className="w-3 h-3 shrink-0" />
                <input type="checkbox" title="US 2" checked={!!checkUS2} onChange={() => toggleCheckboxCard(os.id, "usCheck2", !!checkUS2)} className="w-3 h-3 shrink-0" />
                <p className="text-[9.5px] tracking-tight whitespace-nowrap ml-0.5"><span className="font-semibold">Valor US:</span> R$ {os.valorUS || "0,00"}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {os.dataUS1 && (
                  <span className={`text-[8px] px-0.5 py-[1px] rounded font-mono leading-none tracking-tighter ${checkUS1 ? "bg-gray-700 text-gray-300 line-through" : "bg-amber-100 text-amber-900 font-semibold border border-amber-300"}`}>
                    {os.dataUS1}
                  </span>
                )}
                {os.dataUS2 && (
                  <span className={`text-[8px] px-0.5 py-[1px] rounded font-mono leading-none tracking-tighter ${checkUS2 ? "bg-gray-700 text-gray-300 line-through" : "bg-amber-100 text-amber-900 font-semibold border border-amber-300"}`}>
                    {os.dataUS2}
                  </span>
                )}
              </div>
            </div>

            {/* Linha Valor DMS */}
            <div className="flex items-center gap-1">
              <input type="checkbox" checked={!!os.dmsCheck} onChange={() => toggleCheckboxCard(os.id, "dmsCheck", !!os.dmsCheck)} className="w-3 h-3 shrink-0" />
              <p className="text-[9.5px] tracking-tight"><span className="font-semibold">Valor DMS:</span> R$ {os.valorDMS || "0,00"}</p>
            </div>
            <p className="font-bold text-green-700 mt-1"><span className="font-semibold text-gray-700">Receita:</span> R$ {os.receita || "0,00"}</p>
          </div>
        )}
        
        <div className="flex gap-1 items-center mt-2">
          <button 
            onClick={() => setExpandido(!expandido)}
            className="flex-1 text-blue-600 font-bold hover:underline bg-gray-50 py-1 px-1 rounded border border-gray-100 text-[9.5px] text-center whitespace-nowrap"
          >
            {expandido ? "▲ Ocultar" : "▼ Expandir"}
          </button>
          <div className="flex gap-[3px] shrink-0 bg-gray-50 p-1 rounded-sm border border-gray-100 items-center">
            <button type="button" title="Link de Acompanhamento (Cliente)" onClick={() => abrirLinkCliente(os)}><IconeLink /></button>
            <button type="button" title="Editar OS" onClick={() => abrirEdicaoOS(os)}><IconeLapis /></button>
            <button type="button" title="Finalizar" onClick={() => setOsStatusModal({ id: os.id, acao: "Finalizada", data: new Date().toISOString().split("T")[0] })}><IconeCheck /></button>
            <button type="button" title="Cancelar" onClick={() => setOsStatusModal({ id: os.id, acao: "Cancelada", data: new Date().toISOString().split("T")[0] })}><IconeCancel /></button>
            <button type="button" title="Histórico" onClick={() => setOsHistorico(os)}><IconeLivro /></button>
            <button type="button" title="Dashboard Financeiro" onClick={() => setOsDashboard(os)}><IconeGrafico /></button>
            <button type="button" title="Anexos" onClick={() => setOsAnexos(os)}><IconeClipe /></button>
          </div>
        </div>
      </div>
    );
  };

  const LinhaPlanilhaRodape = ({ os, corTexto, bgLinha }: { os: any, corTexto: string, bgLinha: string }) => {
    const custo = parseMonetario(os.valorCA) + parseMonetario(os.valorPS) + parseMonetario(os.valorUS) + parseMonetario(os.valorDMS);
    const rec = parseMonetario(os.receita);
    const margem = rec > 0 ? ((rec - custo) / rec) * 100 : 0;
    
    return (
      <div className={`flex flex-wrap md:flex-nowrap justify-between items-center ${bgLinha} p-1.5 rounded border shadow-sm text-[10px] border-gray-200 w-full gap-2 hover:bg-white transition leading-none`}>
         <div className={`font-bold ${corTexto} w-36 truncate`} title={os.cliente}>
           {os.numeroOS ? `OS ${os.numeroOS} - ` : ""}{os.cliente}
         </div>
         <div className="w-28 truncate text-gray-700" title={os.clienteFinal}><span className="font-semibold">CF:</span> {os.clienteFinal || "-"}</div>
         <div className="w-24 text-gray-700"><span className="font-semibold">Rec:</span> R$ {rec.toFixed(2)}</div>
         <div className="w-24 text-gray-700"><span className="font-semibold">Custo:</span> R$ {custo.toFixed(2)}</div>
         <div className="w-24 text-gray-700 font-bold"><span className="font-semibold">Result:</span> <span className="text-blue-700">{margem.toFixed(1)}%</span></div>
         <div className="w-20 text-gray-500">{os.dataFinalizacao ? new Date(os.dataFinalizacao + "T12:00:00").toLocaleDateString('pt-BR') : "-"}</div>
         
         <div className="flex gap-1 items-center md:ml-auto">
           <button onClick={() => abrirLinkCliente(os)} title="Link do Cliente" className="bg-indigo-50 border text-indigo-600 p-1 rounded font-bold hover:bg-indigo-100"><IconeLink /></button>
           <button onClick={() => setOsHistorico(os)} title="Histórico" className="bg-blue-50 border text-blue-600 p-1 rounded font-bold hover:bg-blue-100"><IconeLivro /></button>
           <button onClick={() => repatriarOS(os.id)} title="Repatriar OS" className="bg-gray-100 border text-gray-700 p-1 rounded font-bold hover:bg-gray-200"><IconeRepatriar /></button>
           <button onClick={() => setOsParaExcluir(os.id)} title="Excluir Definitivamente" className="bg-red-100 border text-red-700 p-1 rounded font-bold hover:bg-red-200"><IconeLixeira /></button>
         </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-white font-sans text-xs">
      
      <header className="bg-white shadow-sm border-b px-4 py-2.5 flex flex-wrap justify-between items-center gap-2 shrink-0">
        <h1 className="text-lg font-bold text-gray-800">Controle de Operações</h1>
        <div className="flex flex-wrap gap-2 items-center">
          
          <button onClick={() => { setFiltroInstaladorInst("TODOS"); setInstModal(true); }} className="bg-indigo-100 text-indigo-800 border border-indigo-300 px-2.5 py-1.5 rounded text-xs hover:bg-indigo-200 font-bold flex items-center gap-1 shadow-sm transition">
            📅 Prox. Instalações
          </button>

          <button onClick={() => { setFiltroInstaladorVenc("TODOS"); setVencModal("PS"); }} className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-1.5 rounded text-xs hover:bg-amber-200 font-bold flex items-center gap-1 shadow-sm transition">
            ⏳ Venc. PS
          </button>

          <button onClick={() => { setFiltroInstaladorVenc("TODOS"); setVencModal("US"); }} className="bg-sky-100 text-sky-900 border border-sky-300 px-2.5 py-1.5 rounded text-xs hover:bg-sky-200 font-bold flex items-center gap-1 shadow-sm transition">
            ⏳ Venc. US
          </button>

          <button onClick={() => { setFiltroInstaladorVenc("TODOS"); setVencModal("CA"); }} className="bg-orange-100 text-orange-900 border border-orange-300 px-2.5 py-1.5 rounded text-xs hover:bg-orange-200 font-bold flex items-center gap-1 shadow-sm transition">
            ⏳ Venc. CA
          </button>
          
          <button onClick={abrirDRE} className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1.5 rounded text-xs hover:bg-emerald-200 font-bold flex items-center gap-1 shadow-sm transition">
            📊 Gerar DRE
          </button>
          
          <button onClick={() => { setNovaOS(valorInicialOS); setEditandoId(null); setModalAberto(true); }} className="bg-blue-600 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-700 font-bold shadow-sm transition">
            + Nova OS
          </button>

          {/* BOTÃO DE PESQUISA GLOBAL (LUPA) AO LADO DO SINO */}
          <button
            type="button"
            onClick={() => { setTermoBusca(""); setBuscaModalAberto(true); }}
            title="Pesquisar OS ou informações cadastradas"
            className="p-1.5 bg-gray-100 rounded-full hover:bg-blue-100 text-gray-700 transition flex items-center justify-center border border-gray-200"
          >
            <IconeLupa />
          </button>
          
          <div className="relative">
            <button onClick={() => setNotificacoesAbertas(!notificacoesAbertas)} className="relative p-1.5 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-700 transition">
              🔔
              {temNaoLidas && <span className="absolute -top-1 -right-1 bg-red-500 w-3 h-3 rounded-full animate-pulse"></span>}
            </button>
            
            {notificacoesAbertas && (
              <div className="fixed inset-0 z-40" onClick={() => setNotificacoesAbertas(false)}></div>
            )}

            {notificacoesAbertas && (
              <div className="absolute right-0 mt-2 w-72 bg-white border shadow-xl rounded-md z-50 p-2 text-[10px] max-h-96 flex flex-col">
                <div className="flex justify-between items-center border-b pb-1 mb-2 shrink-0">
                  <h3 className="font-bold text-gray-800">Notificações Recentes</h3>
                  {temNaoLidas && (
                    <button onClick={marcarComoLidas} className="text-blue-600 hover:underline font-bold text-[9px]">
                      Marcar como lidas
                    </button>
                  )}
                </div>
                
                <div className="overflow-y-auto pr-1">
                  {notificacoesGlobais.map((notif: any, i: number) => (
                    <div key={i} className={`mb-2 p-1.5 rounded border ${temNaoLidas && notif.data > (ultimaNotificacaoLida || "") ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-100"}`}>
                      <p className="font-bold text-blue-700 truncate">{notif.cliente}</p>
                      <p className="text-gray-700">{notif.acao}</p>
                      <p className="text-gray-400 flex justify-between"><span>{notif.usuario}</span> <span>{formatarDataHora(notif.data)}</span></p>
                    </div>
                  ))}
                  {notificacoesGlobais.length === 0 && <p className="text-gray-500 italic text-center py-4">Nenhuma movimentação registrada.</p>}
                </div>
              </div>
            )}
          </div>

          <button onClick={fazerLogout} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-xs hover:bg-red-500 hover:text-white font-medium shadow-sm transition">
            Sair
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-3 items-start border-b-4 border-gray-200 bg-gray-50">
        {ETAPAS.map((etp) => {
          const isMin = minimizados.includes(etp.nome);
          return (
            <div 
              key={etp.nome} 
              className={`${etp.cor} border rounded-md flex flex-col max-h-full transition-all duration-300 ${isMin ? "w-[30px] min-w-[30px]" : "w-[240px] min-w-[240px]"}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, etp.nome)}
            >
              <div className="p-1.5 font-bold rounded-t-md border-b flex justify-between items-center text-[10px] bg-white/50 backdrop-blur-sm">
                {!isMin && <span className="truncate pr-1 uppercase text-[9px] tracking-wider">{etp.nome}</span>}
                <button onClick={() => toggleMinimizar(etp.nome)} className="text-gray-500 hover:text-black bg-white/80 px-1 py-0.5 rounded text-[8px] border border-gray-300 shadow-sm flex-shrink-0 leading-none">
                  {isMin ? "➕" : "➖"}
                </button>
              </div>
              
              {!isMin && (
                <div className="p-2 flex-1 overflow-y-auto">
                  {listaOS.filter(os => os.etapa === etp.nome).map(os => <OsCard key={os.id} os={os} />)}
                  {listaOS.filter(os => os.etapa === etp.nome).length === 0 && (
                    <div className="text-center text-gray-400 text-[9px] mt-2 p-2 border border-dashed rounded bg-white/40">Soltar OS aqui</div>
                  )}
                </div>
              )}
              {isMin && (
                <div className="flex-1 flex items-start justify-center pt-2">
                  <span className="bg-white border text-gray-700 text-[9px] w-5 h-5 flex items-center justify-center rounded-full font-bold shadow-sm">
                    {listaOS.filter(os => os.etapa === etp.nome).length}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </main>

      <div className="h-[25vh] shrink-0 bg-white overflow-y-auto p-4 flex flex-col gap-4 shadow-inner">
        <div className="bg-green-50 border border-green-200 p-2 rounded-md">
          <div className="flex justify-between items-center border-b border-green-200 pb-1 mb-2">
            <h2 className="text-green-800 font-bold text-xs">✅ OS Finalizadas ({listaOS.filter(os => os.etapa === "Finalizada").length})</h2>
            <button onClick={() => setMinFinalizadas(!minFinalizadas)} className="text-green-800 text-xs hover:bg-green-200 px-2 py-0.5 rounded border border-green-200 bg-white">
              {minFinalizadas ? "➕ Expandir" : "➖ Minimizar"}
            </button>
          </div>
          {!minFinalizadas && (
            <div className="flex flex-col gap-1.5">
              {listaOS.filter(os => os.etapa === "Finalizada").map(os => 
                <LinhaPlanilhaRodape key={os.id} os={os} corTexto="text-green-800" bgLinha="bg-green-50/50" />
              )}
            </div>
          )}
        </div>

        <div className="bg-red-50 border border-red-200 p-2 rounded-md">
          <div className="flex justify-between items-center border-b border-red-200 pb-1 mb-2">
            <h2 className="text-red-800 font-bold text-xs">❌ OS Canceladas ({listaOS.filter(os => os.etapa === "Cancelada").length})</h2>
            <button onClick={() => setMinCanceladas(!minCanceladas)} className="text-red-800 text-xs hover:bg-red-200 px-2 py-0.5 rounded border border-red-200 bg-white">
              {minCanceladas ? "➕ Expandir" : "➖ Minimizar"}
            </button>
          </div>
          {!minCanceladas && (
            <div className="flex flex-col gap-1.5">
               {listaOS.filter(os => os.etapa === "Cancelada").map(os => 
                 <LinhaPlanilhaRodape key={os.id} os={os} corTexto="text-red-800" bgLinha="bg-red-50/50" />
               )}
            </div>
          )}
        </div>
      </div>

      {/* MODAL: LINK DE ACOMPANHAMENTO DO CLIENTE 🔗 */}
      {osLinkModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[80] text-xs"
          onClick={() => setOsLinkModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 border-t-4 border-indigo-600"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b pb-2 mb-3">
              <h2 className="font-bold text-indigo-900 text-sm flex items-center gap-1.5">
                <IconeLink /> Link de Acompanhamento — {osLinkModal.os.numeroOS ? `OS ${osLinkModal.os.numeroOS}` : osLinkModal.os.cliente}
              </h2>
              <button onClick={() => setOsLinkModal(null)} className="text-red-500 font-bold text-lg hover:scale-110">&times;</button>
            </div>

            <p className="text-gray-600 mb-3 text-[11px] leading-relaxed">
              Envie este link exclusivo para <strong>{osLinkModal.os.cliente}</strong> acompanhar a evolução da obra em tempo real. Todos os dados financeiros e internos ficam 100% ocultos.
            </p>

            <div className="bg-slate-50 border border-slate-300 rounded p-2 mb-3 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={osLinkModal.url}
                onFocus={(e) => e.target.select()}
                className="w-full bg-transparent text-slate-800 font-mono text-[11px] focus:outline-none"
              />
            </div>

            {osLinkModal.copiado && (
              <p className="text-emerald-700 font-bold text-[11px] mb-3 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded">
                ✓ Link copiado para a área de transferência!
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    await navigator.clipboard.writeText(osLinkModal.url);
                    setOsLinkModal({ ...osLinkModal, copiado: true });
                  }
                }}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded shadow-sm transition"
              >
                📋 Copiar Link
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Olá! Acompanhe o andamento da sua instalação solar (${osLinkModal.os.numeroOS ? `OS #${osLinkModal.os.numeroOS} - ` : ""}${osLinkModal.os.cliente}) em tempo real pelo link: ${osLinkModal.url}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded shadow-sm transition inline-flex items-center gap-1"
              >
                💬 Enviar no WhatsApp
              </a>

              <button
                type="button"
                onClick={() => setOsLinkModal(null)}
                className="px-3 py-1.5 border rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PESQUISA GLOBAL DE OS (LUPA) */}
      {buscaModalAberto && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center p-4 pt-14 z-[75] text-xs"
          onClick={() => setBuscaModalAberto(false)}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-4xl p-5 max-h-[82vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b pb-2 mb-3 shrink-0">
              <h2 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <IconeLupa /> Pesquisar Ordens de Serviço
              </h2>
              <button onClick={() => setBuscaModalAberto(false)} className="text-red-500 font-bold text-xl hover:scale-110">&times;</button>
            </div>

            <div className="mb-3 shrink-0 flex gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Digite nº da OS, cliente, cliente final, endereço, instalador, vistoriador, inversor, módulos ou observações..."
                className="w-full border border-blue-300 focus:border-blue-600 focus:outline-none p-2.5 rounded text-sm text-black bg-blue-50/30"
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
              />
              {termoBusca && (
                <button
                  type="button"
                  onClick={() => setTermoBusca("")}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded border font-bold"
                >
                  Limpar
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {!termoBusca.trim() ? (
                <div className="text-center text-gray-400 italic py-12 border-2 border-dashed rounded bg-gray-50">
                  Digite qualquer palavra, número ou nome acima para localizar OSs no Kanban, Finalizadas ou Canceladas.
                </div>
              ) : resultadosBusca.length === 0 ? (
                <div className="text-center text-gray-500 italic py-12 border rounded bg-gray-50">
                  Nenhuma OS encontrada para &ldquo;{termoBusca}&rdquo;.
                </div>
              ) : (
                <>
                  <p className="text-[11px] font-bold text-gray-600 mb-1">
                    {resultadosBusca.length} {resultadosBusca.length === 1 ? "OS encontrada" : "OSs encontradas"}:
                  </p>
                  {resultadosBusca.map((os) => (
                    <div key={os.id} className="border border-gray-200 rounded p-3 bg-gray-50/70 hover:bg-white hover:shadow-sm transition flex flex-col md:flex-row justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-sm text-blue-900">
                            {os.numeroOS ? `OS ${os.numeroOS} - ` : ""}{os.cliente}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            os.etapa === "Finalizada"
                              ? "bg-green-100 text-green-800 border-green-300"
                              : os.etapa === "Cancelada"
                              ? "bg-red-100 text-red-800 border-red-300"
                              : "bg-blue-100 text-blue-800 border-blue-200"
                          }`}>
                            {os.etapa}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-gray-700">
                          <p className="truncate"><span className="font-semibold">Cliente Final:</span> {os.clienteFinal || "-"}</p>
                          <p className="truncate"><span className="font-semibold">Endereço:</span> {os.endereco || "-"}</p>
                          <p><span className="font-semibold">Instalador:</span> {os.instalador || "-"}</p>
                          <p><span className="font-semibold">Vistoriador:</span> {os.vistoriador || "-"}</p>
                          <p><span className="font-semibold">Data Inst.:</span> {os.dataInstalacao ? new Date(os.dataInstalacao + "T12:00:00").toLocaleDateString("pt-BR") : "-"}</p>
                          <p><span className="font-semibold">Equip.:</span> {[os.modulos, os.inversor].filter(Boolean).join(" | ") || "-"}</p>
                        </div>
                        {os.obs && (
                          <p className="text-[11px] text-gray-600 bg-white p-1.5 rounded border border-gray-100">
                            <span className="font-semibold">Obs:</span> {os.obs}
                          </p>
                        )}
                      </div>

                      <div className="flex md:flex-col justify-end gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setBuscaModalAberto(false); abrirLinkCliente(os); }}
                          className="px-2.5 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded font-bold hover:bg-indigo-100 flex items-center gap-1"
                        >
                          <IconeLink /> Link Cliente
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBuscaModalAberto(false); abrirEdicaoOS(os); }}
                          className="px-2.5 py-1 bg-orange-50 text-orange-800 border border-orange-200 rounded font-bold hover:bg-orange-100 flex items-center gap-1"
                        >
                          <IconeLapis /> Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBuscaModalAberto(false); setOsHistorico(os); }}
                          className="px-2.5 py-1 bg-gray-100 text-gray-700 border border-gray-200 rounded font-bold hover:bg-gray-200 flex items-center gap-1"
                        >
                          <IconeLivro /> Histórico
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBuscaModalAberto(false); setOsDashboard(os); }}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded font-bold hover:bg-blue-100 flex items-center gap-1"
                        >
                          <IconeGrafico /> Financeiro
                        </button>
                        <button
                          type="button"
                          onClick={() => { setBuscaModalAberto(false); setOsAnexos(os); }}
                          className="px-2.5 py-1 bg-gray-100 text-gray-800 border border-gray-200 rounded font-bold hover:bg-gray-200 flex items-center gap-1"
                        >
                          <IconeClipe /> Anexos
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VENCIMENTOS EM ABERTO (PS, US, CA) COM VALOR DIVIDIDO POR 2 */}
      {vencModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70] text-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl p-5 h-[80vh] flex flex-col">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-2 mb-4 shrink-0">
              <h2 className="font-bold text-amber-900 text-lg">
                ⏳ Vencimentos em Aberto — Valor {vencModal} ({vencimentosAbertos.length})
              </h2>

              <div className="flex items-center gap-2">
                {vencModal === "PS" && (
                  <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded text-xs">
                    <label className="font-bold text-amber-900">Filtrar Instalador:</label>
                    <select
                      value={filtroInstaladorVenc}
                      onChange={(e) => setFiltroInstaladorVenc(e.target.value)}
                      className="border border-amber-300 rounded px-2 py-0.5 bg-white text-black font-semibold"
                    >
                      <option value="TODOS">Todos ({vencimentosAbertosBase.length})</option>
                      {instaladoresDisponiveisVenc.map((inst) => (
                        <option key={inst} value={inst}>{inst}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button onClick={() => setVencModal(null)} className="text-red-500 font-bold text-xl hover:scale-110 ml-2">&times;</button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1 border border-amber-300 rounded shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-amber-100 text-amber-900 sticky top-0 shadow-sm">
                  <tr>
                    <th className="p-2 border-b">Vencimento (DD/MM)</th>
                    <th className="p-2 border-b">Referência</th>
                    <th className="p-2 border-b">OS / Cliente</th>
                    <th className="p-2 border-b">Cliente Final</th>
                    {vencModal === "PS" && <th className="p-2 border-b">Vistoriador</th>}
                    <th className="p-2 border-b">Instalador</th>
                    <th className="p-2 border-b">Valor Parcela (50%)</th>
                    <th className="p-2 border-b text-gray-500">Total Lançado</th>
                    <th className="p-2 border-b">Etapa Atual</th>
                    <th className="p-2 border-b text-center">Dar Baixa (Pago)</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {vencimentosAbertos.map((item, idx) => (
                    <tr key={`${item.id}-${idx}`} className="border-b hover:bg-gray-50 transition text-gray-800">
                      <td className="p-2 font-bold whitespace-nowrap">
                        <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-mono border border-amber-300">
                          {item.dataVenc}
                        </span>
                      </td>
                      <td className="p-2 text-gray-600 font-semibold whitespace-nowrap">{item.parcela}</td>
                      <td className="p-2 font-bold text-blue-900 truncate max-w-[180px]" title={item.cliente}>
                        OS {item.numeroOS || "-"} - {item.cliente}
                      </td>
                      <td className="p-2 text-gray-700 truncate max-w-[150px]" title={item.clienteFinal}>
                        {item.clienteFinal}
                      </td>
                      {vencModal === "PS" && (
                        <td className="p-2 font-semibold text-gray-800 whitespace-nowrap">
                          {item.vistoriador}
                        </td>
                      )}
                      <td className="p-2 text-gray-700 whitespace-nowrap">
                        {item.instalador || "-"}
                      </td>
                      <td className="p-2 font-bold text-red-700 whitespace-nowrap">R$ {item.valorParcela}</td>
                      <td className="p-2 text-gray-500 whitespace-nowrap">R$ {item.valorTotal}</td>
                      <td className="p-2">
                        <span className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-gray-600 whitespace-nowrap">
                          {item.etapa}
                        </span>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggleCheckboxCard(item.id, item.campoCheck, item.valorCheckAtual)}
                          className="bg-green-100 text-green-800 border border-green-300 px-2 py-1 rounded text-[10px] font-bold hover:bg-green-600 hover:text-white transition whitespace-nowrap"
                        >
                          ✓ Marcar Pago
                        </button>
                      </td>
                    </tr>
                  ))}
                  {vencimentosAbertos.length === 0 && (
                    <tr>
                      <td colSpan={vencModal === "PS" ? 10 : 9} className="p-8 text-center text-gray-500 italic">
                        Nenhum vencimento de {vencModal} em aberto para o filtro selecionado!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRÓXIMAS INSTALAÇÕES */}
      {instModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70] text-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl p-5 h-[80vh] flex flex-col">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-2 mb-4 shrink-0">
              <h2 className="font-bold text-indigo-800 text-lg">
                📅 Próximas Instalações ({proximasInstalacoes.length})
              </h2>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded text-xs">
                  <label className="font-bold text-indigo-900">Filtrar Instalador:</label>
                  <select
                    value={filtroInstaladorInst}
                    onChange={(e) => setFiltroInstaladorInst(e.target.value)}
                    className="border border-indigo-300 rounded px-2 py-0.5 bg-white text-black font-semibold"
                  >
                    <option value="TODOS">Todos ({proximasInstalacoesBase.length})</option>
                    {instaladoresDisponiveisInst.map((inst) => (
                      <option key={inst} value={inst}>{inst}</option>
                    ))}
                  </select>
                </div>
                <button onClick={() => setInstModal(false)} className="text-red-500 font-bold text-xl hover:scale-110 ml-2">&times;</button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1 border border-indigo-300 rounded shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-indigo-100 text-indigo-900 sticky top-0 shadow-sm">
                  <tr>
                    <th className="p-2 border-b">Data Instalação</th>
                    <th className="p-2 border-b">OS / Cliente</th>
                    <th className="p-2 border-b">Cliente Final</th>
                    <th className="p-2 border-b">Endereço</th>
                    <th className="p-2 border-b">Instalador</th>
                    <th className="p-2 border-b">Etapa Atual</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {proximasInstalacoes.map((os) => {
                    const atrasada = isDataAtrasada(os.dataInstalacao);
                    return (
                      <tr key={os.id} className="border-b hover:bg-gray-50 transition text-gray-800">
                        <td className={`p-2 font-bold whitespace-nowrap ${atrasada ? 'text-red-600' : 'text-blue-700'}`}>
                          {new Date(os.dataInstalacao + "T12:00:00").toLocaleDateString('pt-BR')}
                          {atrasada && <span className="ml-1 text-[9px] bg-red-100 text-red-800 px-1 py-0.5 rounded">Atrasada</span>}
                        </td>
                        <td className="p-2 font-bold text-gray-700 truncate max-w-[190px]" title={os.cliente}>
                          OS {os.numeroOS || "-"} - {os.cliente}
                        </td>
                        <td className="p-2 text-gray-700 truncate max-w-[160px]" title={os.clienteFinal}>
                          {os.clienteFinal || "-"}
                        </td>
                        <td className="p-2 truncate max-w-[230px]" title={os.endereco}>{os.endereco}</td>
                        <td className="p-2 font-semibold">{os.instalador || "-"}</td>
                        <td className="p-2"><span className="bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-gray-600 whitespace-nowrap">{os.etapa}</span></td>
                      </tr>
                    );
                  })}
                  {proximasInstalacoes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500 italic">
                        Nenhuma instalação encontrada para o filtro selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXCLUIR OS DEFINITIVAMENTE */}
      {osParaExcluir && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[80]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5 border-t-4 border-red-600">
            <h2 className="font-bold text-red-700 mb-2 text-sm">⚠ Excluir Ordem de Serviço</h2>
            <p className="text-gray-600 mb-4 text-[11px]">Esta ação não pode ser desfeita. Digite a senha administrativa para confirmar a exclusão.</p>
            <form onSubmit={excluirOSDefinitivo}>
              <input type="password" required placeholder="Senha de Exclusão" className="w-full border p-2 rounded text-sm mb-4 text-black" value={senhaExclusao} onChange={e => setSenhaExclusao(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => {setOsParaExcluir(null); setSenhaExclusao("");}} className="px-3 py-1.5 border rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Cancelar</button>
                <button type="submit" className="px-4 py-1.5 text-white font-bold rounded shadow-md bg-red-600 hover:bg-red-700">Deletar OS</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CRIAR / EDITAR OS */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 z-[60] text-xs">
          <div className="bg-white rounded shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-3 border-b flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-gray-800">{editandoId ? "Editar Ordem de Serviço" : "Nova Ordem de Serviço"}</h2>
              <button onClick={() => setModalAberto(false)} className="text-red-500 font-bold text-lg">&times;</button>
            </div>
            <form onSubmit={salvarNovaOS} className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input required placeholder="Cliente (Obrigatório)" className="border p-1.5 rounded text-black" value={novaOS.cliente} onChange={e => setNovaOS({...novaOS, cliente: e.target.value})} />
                <input required placeholder="Endereço (Obrigatório)" className="border p-1.5 rounded text-black" value={novaOS.endereco} onChange={e => setNovaOS({...novaOS, endereco: e.target.value})} />
                <input placeholder="Cliente Final" className="border p-1.5 rounded text-black" value={novaOS.clienteFinal} onChange={e => setNovaOS({...novaOS, clienteFinal: e.target.value})} />
                <input type="date" title="Data de Instalação" className="border p-1.5 rounded text-black" value={novaOS.dataInstalacao} onChange={e => setNovaOS({...novaOS, dataInstalacao: e.target.value})} />
                <input placeholder="Instalador" className="border p-1.5 rounded text-black" value={novaOS.instalador} onChange={e => setNovaOS({...novaOS, instalador: e.target.value})} />
                <input placeholder="Vistoriador" className="border p-1.5 rounded text-black" value={novaOS.vistoriador || ""} onChange={e => setNovaOS({...novaOS, vistoriador: e.target.value})} />
                <input placeholder="Módulos" className="border p-1.5 rounded text-black" value={novaOS.modulos} onChange={e => setNovaOS({...novaOS, modulos: e.target.value})} />
                <input placeholder="Inversor" className="border p-1.5 rounded text-black" value={novaOS.inversor} onChange={e => setNovaOS({...novaOS, inversor: e.target.value})} />
                <input placeholder="Nota Técnica" className="border p-1.5 rounded md:col-span-2 text-black" value={novaOS.notaTecnica} onChange={e => setNovaOS({...novaOS, notaTecnica: e.target.value})} />
                <textarea placeholder="Observações" className="border p-1.5 rounded md:col-span-2 text-black" rows={2} value={novaOS.obs} onChange={e => setNovaOS({...novaOS, obs: e.target.value})} />
                
                <div className="md:col-span-2 mt-2 font-bold text-blue-800 border-b pb-1">Financeiro (Formatado em R$) e Vencimentos (DD/MM)</div>
                
                {/* Campo Valor CA + 2 Checkboxes e 2 Datas */}
                <div className="flex items-center gap-1">
                  <input type="checkbox" title="CA 1" checked={!!novaOS.caCheck1} onChange={e => setNovaOS({...novaOS, caCheck1: e.target.checked})} className="w-4 h-4 shrink-0"/>
                  <input type="checkbox" title="CA 2" checked={!!novaOS.caCheck2} onChange={e => setNovaOS({...novaOS, caCheck2: e.target.checked})} className="w-4 h-4 shrink-0"/>
                  <input placeholder="Valor CA" className="border p-1.5 rounded w-full text-black" value={novaOS.valorCA} onChange={e => setNovaOS({...novaOS, valorCA: mascaraMoeda(e.target.value)})} />
                  <input placeholder="DD/MM" maxLength={5} title="Vencimento CA 1" className="border p-1.5 rounded w-14 text-center text-black shrink-0" value={novaOS.dataCA1 || ""} onChange={e => setNovaOS({...novaOS, dataCA1: mascaraDiaMes(e.target.value)})} />
                  <input placeholder="DD/MM" maxLength={5} title="Vencimento CA 2" className="border p-1.5 rounded w-14 text-center text-black shrink-0" value={novaOS.dataCA2 || ""} onChange={e => setNovaOS({...novaOS, dataCA2: mascaraDiaMes(e.target.value)})} />
                </div>
                
                {/* Campo Valor PS + 2 Checkboxes e 2 Datas */}
                <div className="flex items-center gap-1">
                  <input type="checkbox" title="PS 1" checked={!!novaOS.psCheck1} onChange={e => setNovaOS({...novaOS, psCheck1: e.target.checked})} className="w-4 h-4 shrink-0"/>
                  <input type="checkbox" title="PS 2" checked={!!novaOS.psCheck2} onChange={e => setNovaOS({...novaOS, psCheck2: e.target.checked})} className="w-4 h-4 shrink-0"/>
                  <input placeholder="Valor PS" className="border p-1.5 rounded w-full text-black" value={novaOS.valorPS} onChange={e => setNovaOS({...novaOS, valorPS: mascaraMoeda(e.target.value)})} />
                  <input placeholder="DD/MM" maxLength={5} title="Vencimento PS 1" className="border p-1.5 rounded w-14 text-center text-black shrink-0" value={novaOS.dataPS1 || ""} onChange={e => setNovaOS({...novaOS, dataPS1: mascaraDiaMes(e.target.value)})} />
                  <input placeholder="DD/MM" maxLength={5} title="Vencimento PS 2" className="border p-1.5 rounded w-14 text-center text-black shrink-0" value={novaOS.dataPS2 || ""} onChange={e => setNovaOS({...novaOS, dataPS2: mascaraDiaMes(e.target.value)})} />
                </div>
                
                {/* Campo Valor US + 2 Checkboxes e 2 Datas */}
                <div className="flex items-center gap-1">
                  <input type="checkbox" title="US 1" checked={!!novaOS.usCheck1} onChange={e => setNovaOS({...novaOS, usCheck1: e.target.checked})} className="w-4 h-4 shrink-0"/>
                  <input type="checkbox" title="US 2" checked={!!novaOS.usCheck2} onChange={e => setNovaOS({...novaOS, usCheck2: e.target.checked})} className="w-4 h-4 shrink-0"/>
                  <input placeholder="Valor US" className="border p-1.5 rounded w-full text-black" value={novaOS.valorUS} onChange={e => setNovaOS({...novaOS, valorUS: mascaraMoeda(e.target.value)})} />
                  <input placeholder="DD/MM" maxLength={5} title="Vencimento US 1" className="border p-1.5 rounded w-14 text-center text-black shrink-0" value={novaOS.dataUS1 || ""} onChange={e => setNovaOS({...novaOS, dataUS1: mascaraDiaMes(e.target.value)})} />
                  <input placeholder="DD/MM" maxLength={5} title="Vencimento US 2" className="border p-1.5 rounded w-14 text-center text-black shrink-0" value={novaOS.dataUS2 || ""} onChange={e => setNovaOS({...novaOS, dataUS2: mascaraDiaMes(e.target.value)})} />
                </div>

                {/* Campo Valor DMS */}
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={novaOS.dmsCheck} onChange={e => setNovaOS({...novaOS, dmsCheck: e.target.checked})} className="w-4 h-4 shrink-0"/>
                  <input placeholder="Valor DMS" className="border p-1.5 rounded w-full text-black" value={novaOS.valorDMS} onChange={e => setNovaOS({...novaOS, valorDMS: mascaraMoeda(e.target.value)})} />
                </div>
                
                <input placeholder="Receita Total" className="border p-1.5 rounded md:col-span-2 bg-green-50 font-bold text-black" value={novaOS.receita} onChange={e => setNovaOS({...novaOS, receita: mascaraMoeda(e.target.value)})} />
              </div>
              <div className="mt-4 flex justify-end gap-2 border-t pt-2">
                <button type="button" onClick={() => setModalAberto(false)} className="px-3 py-1.5 border rounded text-gray-700">Cancelar</button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">{editandoId ? "Salvar Edição" : "Criar Nova OS"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SOLICITAR DATA DE FINALIZAÇÃO/CANCELAMENTO */}
      {osStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-5">
            <h2 className="font-bold text-gray-800 mb-4 text-sm border-b pb-2">Confirmar Ação: {osStatusModal.acao}</h2>
            <form onSubmit={confirmarStatusComData}>
              <label className="block text-xs font-bold text-gray-700 mb-1">Data da Finalização / Cancelamento:</label>
              <input type="date" required className="w-full border p-2 rounded text-sm mb-5 text-black" value={osStatusModal.data} onChange={e => setOsStatusModal({...osStatusModal, data: e.target.value})} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOsStatusModal(null)} className="px-3 py-1.5 border rounded bg-gray-100 hover:bg-gray-200 text-gray-700">Cancelar</button>
                <button type="submit" className={`px-4 py-1.5 text-white font-bold rounded shadow-md ${osStatusModal.acao === "Finalizada" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DRE DETALHADO (PLANILHA) */}
      {dreModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-[70] text-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl p-5 h-[90vh] flex flex-col">
            
            <div className="flex justify-between border-b pb-2 mb-4 shrink-0">
              <h2 className="font-bold text-emerald-800 text-lg">📊 Gerar DRE (Demonstração do Resultado OS por OS)</h2>
              <button onClick={() => setDreModal(false)} className="text-red-500 font-bold text-xl hover:scale-110">&times;</button>
            </div>
            
            <div className="flex gap-4 mb-4 shrink-0">
              <div className="flex gap-2 flex-1">
                <button onClick={setSemanaPassada} className="flex-1 bg-blue-50 text-blue-700 border border-blue-200 py-1.5 rounded font-bold hover:bg-blue-100 text-xs transition">Últimos 7 dias</button>
                <button onClick={setMesPassado} className="flex-1 bg-purple-50 text-purple-700 border border-purple-200 py-1.5 rounded font-bold hover:bg-purple-100 text-xs transition">Mês Passado</button>
              </div>
              <div className="flex gap-2 flex-1 bg-gray-50 p-1.5 border rounded items-center">
                <label className="text-xs font-bold text-gray-600">Início:</label>
                <input type="date" className="border p-1 rounded text-black text-xs" value={dreStart} onChange={e => setDreStart(e.target.value)} />
                <label className="text-xs font-bold text-gray-600 ml-2">Fim:</label>
                <input type="date" className="border p-1 rounded text-black text-xs" value={dreEnd} onChange={e => setDreEnd(e.target.value)} />
              </div>
            </div>

            {dreStart && dreEnd ? (
              <>
                <div className="overflow-x-auto flex-1 border border-emerald-300 rounded shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-emerald-100 text-emerald-900 sticky top-0 shadow-sm">
                       <tr>
                         <th className="p-2 border-b">OS / Cliente</th>
                         <th className="p-2 border-b">Data Finalização</th>
                         <th className="p-2 border-b text-red-900">V. CA</th>
                         <th className="p-2 border-b text-red-900">V. PS</th>
                         <th className="p-2 border-b text-red-900">V. US</th>
                         <th className="p-2 border-b text-red-900">V. DMS</th>
                         <th className="p-2 border-b font-black text-red-900 bg-red-100/50">Custo Total</th>
                         <th className="p-2 border-b font-black text-green-900 bg-green-100/50">Receita Bruta</th>
                         <th className="p-2 border-b font-black text-blue-900 bg-blue-100/50">Lucro (R$)</th>
                         <th className="p-2 border-b font-black text-blue-900 bg-blue-100/50">Margem (%)</th>
                       </tr>
                    </thead>
                    <tbody className="bg-white">
                       {dre.detalhamento.map((item, i) => (
                         <tr key={i} className="border-b hover:bg-gray-50 transition text-gray-800">
                           <td className="p-2 truncate max-w-[160px]" title={item.cliente}>
                              <span className="font-bold text-gray-600">OS {item.numeroOS || "-"}</span> - {item.cliente}
                           </td>
                           <td className="p-2 text-gray-500">{new Date(item.dataFinalizacao + "T12:00:00").toLocaleDateString('pt-BR')}</td>
                           <td className="p-2 text-red-700">R$ {item.ca.toFixed(2)}</td>
                           <td className="p-2 text-red-700">R$ {item.ps.toFixed(2)}</td>
                           <td className="p-2 text-red-700">R$ {item.us.toFixed(2)}</td>
                           <td className="p-2 text-red-700">R$ {item.dms.toFixed(2)}</td>
                           <td className="p-2 font-bold text-red-800 bg-red-50/50">R$ {item.custo.toFixed(2)}</td>
                           <td className="p-2 font-bold text-green-700 bg-green-50/50">R$ {item.rec.toFixed(2)}</td>
                           <td className="p-2 font-bold text-blue-700 bg-blue-50/50">R$ {item.lucro.toFixed(2)}</td>
                           <td className="p-2 font-bold text-blue-700 bg-blue-50/50">{item.margem.toFixed(1)}%</td>
                         </tr>
                       ))}
                       {dre.detalhamento.length === 0 && (
                         <tr>
                           <td colSpan={10} className="p-8 text-center text-gray-500 italic">
                             Nenhuma OS foi finalizada neste período selecionado.
                           </td>
                         </tr>
                       )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-gray-100 p-4 mt-4 rounded border border-gray-300 flex justify-between items-center text-sm font-bold shrink-0 shadow-sm">
                   <span className="text-gray-700 bg-white px-3 py-1 rounded shadow-sm border border-gray-200">Qtd OS: {dre.qtde}</span>
                   <span className="text-red-700 bg-red-50 px-3 py-1 rounded shadow-sm border border-red-200">Custo Total: R$ {dre.totalCusto.toFixed(2)}</span>
                   <span className="text-green-700 bg-green-50 px-3 py-1 rounded shadow-sm border border-green-200">Receita Total: R$ {dre.totalReceita.toFixed(2)}</span>
                   <span className="text-blue-800 bg-blue-50 px-4 py-1.5 rounded shadow-md border border-blue-200 text-base">LUCRO TOTAL: R$ {dre.lucroTotal.toFixed(2)}</span>
                   <span className="text-blue-800 bg-blue-50 px-3 py-1.5 rounded shadow-sm border border-blue-200">Margem Geral: {dre.margemTotal.toFixed(1)}%</span>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-300 rounded text-gray-400 bg-gray-50">
                Selecione um período acima para visualizar as margens de lucro.
              </div>
            )}
          </div>
        </div>
      )}

      {/* POPUP: HISTÓRICO 📖 */}
      {osHistorico && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded shadow-xl w-full max-w-md p-4">
            <div className="flex justify-between items-center border-b pb-2 mb-2">
              <h2 className="font-bold text-gray-800 text-sm">Histórico: {osHistorico.cliente}</h2>
              <button onClick={() => setOsHistorico(null)} className="text-red-500 font-bold text-lg">&times;</button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2 text-[10px]">
              {osHistorico.historico ? osHistorico.historico.map((hist: any, i: number) => (
                <div key={i} className="bg-gray-50 p-2 rounded border border-gray-200">
                  <p className="font-bold text-blue-700">{hist.acao}</p>
                  <p className="text-gray-500">Por: {hist.usuario}</p>
                  <p className="text-gray-400">{formatarDataHora(hist.data)}</p>
                </div>
              )).reverse() : <p>Sem histórico registrado.</p>}
            </div>
          </div>
        </div>
      )}

      {/* POPUP: DASHBOARD FINANCEIRO 📊 */}
      {osDashboard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded shadow-xl w-full max-w-sm p-4">
            <div className="flex justify-between items-center border-b pb-2 mb-4">
              <h2 className="font-bold text-gray-800 text-sm">Dashboard: {osDashboard.cliente}</h2>
              <button onClick={() => setOsDashboard(null)} className="text-red-500 font-bold text-lg">&times;</button>
            </div>
            <div className="space-y-2 text-xs text-black">
              <div className="flex justify-between border-b pb-1"><span className="font-semibold">Valor CA:</span> <span>R$ {parseMonetario(osDashboard.valorCA).toFixed(2)}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="font-semibold">Valor PS:</span> <span>R$ {parseMonetario(osDashboard.valorPS).toFixed(2)}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="font-semibold">Valor US:</span> <span>R$ {parseMonetario(osDashboard.valorUS).toFixed(2)}</span></div>
              <div className="flex justify-between border-b pb-1"><span className="font-semibold">Valor DMS:</span> <span>R$ {parseMonetario(osDashboard.valorDMS).toFixed(2)}</span></div>
              <div className="flex justify-between pt-2 text-red-600 font-bold">
                <span>CUSTO TOTAL:</span> 
                <span>R$ {(parseMonetario(osDashboard.valorCA) + parseMonetario(osDashboard.valorPS) + parseMonetario(osDashboard.valorUS) + parseMonetario(osDashboard.valorDMS)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-green-700 font-bold text-sm bg-green-50 p-2 rounded mt-2 border border-green-200">
                <span>RECEITA:</span> 
                <span>R$ {parseMonetario(osDashboard.receita).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-blue-800 font-black text-sm bg-blue-50 p-2 rounded mt-2 border border-blue-200">
                <span>LUCRO:</span> 
                <span>R$ {(parseMonetario(osDashboard.receita) - (parseMonetario(osDashboard.valorCA) + parseMonetario(osDashboard.valorPS) + parseMonetario(osDashboard.valorUS) + parseMonetario(osDashboard.valorDMS))).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP: ANEXOS MÚLTIPLOS 📎 */}
      {osAnexos && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded shadow-xl w-full max-w-sm p-4">
            <div className="flex justify-between items-center border-b pb-2 mb-4">
              <h2 className="font-bold text-gray-800 text-sm">Arquivos: {osAnexos.cliente}</h2>
              <button
                onClick={() => {
                  setOsAnexos(null);
                  setArquivosSelecionados([]);
                  if (inputArquivoRef.current) inputArquivoRef.current.value = "";
                }}
                className="text-red-500 font-bold text-lg"
              >
                &times;
              </button>
            </div>
            
            <div className="mb-4 bg-gray-50 p-3 border rounded shadow-sm">
              <label className="block text-xs font-bold text-gray-700 mb-2">Enviar novos arquivos (selecione 1 ou vários):</label>
              <div className="flex flex-col gap-2">
                <input 
                  ref={inputArquivoRef}
                  type="file" 
                  multiple
                  onChange={(e) => setArquivosSelecionados(e.target.files ? Array.from(e.target.files) : [])} 
                  className="text-xs border p-1 rounded w-full text-black bg-white" 
                />

                {arquivosSelecionados.length > 0 && (
                  <div className="bg-white border border-blue-200 rounded p-2 space-y-1 max-h-28 overflow-y-auto">
                    <p className="text-[10px] font-bold text-blue-800">
                      {arquivosSelecionados.length} {arquivosSelecionados.length === 1 ? "arquivo selecionado:" : "arquivos selecionados:"}
                    </p>
                    {arquivosSelecionados.map((arq, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-1 text-[10px] text-gray-700 bg-blue-50/60 px-1.5 py-0.5 rounded">
                        <span className="truncate">📎 {arq.name}</span>
                        <button
                          type="button"
                          disabled={enviandoAnexo}
                          onClick={() => {
                            const filtrados = arquivosSelecionados.filter((_, i) => i !== idx);
                            setArquivosSelecionados(filtrados);
                            if (filtrados.length === 0 && inputArquivoRef.current) {
                              inputArquivoRef.current.value = "";
                            }
                          }}
                          className="text-red-500 hover:text-red-700 font-bold shrink-0 px-1 disabled:opacity-40"
                          title="Remover da fila"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button 
                  type="button" 
                  onClick={enviarAnexo} 
                  disabled={arquivosSelecionados.length === 0 || enviandoAnexo} 
                  className={`text-white font-bold py-1.5 rounded text-xs transition ${arquivosSelecionados.length === 0 || enviandoAnexo ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                  {enviandoAnexo
                    ? (progressoAnexo || "Enviando para a nuvem...")
                    : arquivosSelecionados.length > 1
                      ? `Confirmar e Anexar (${arquivosSelecionados.length} arquivos) ⇧`
                      : "Confirmar e Anexar ⇧"}
                </button>
              </div>
            </div>
            
            <h3 className="font-bold text-xs text-gray-600 border-b pb-1 mb-2">Arquivos Salvos:</h3>
            <div className="max-h-40 overflow-y-auto space-y-2 text-[10px] pr-1">
              {osAnexos.anexos && osAnexos.anexos.length > 0 ? (
                osAnexos.anexos.map((arq: any, i: number) => {
                  const chaveItem = arq.data || arq.nome;
                  return (
                    <div key={i} className="flex justify-between items-center gap-1.5 bg-white p-2 rounded border shadow-sm">
                      <a 
                        href={arq.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="font-bold text-blue-600 truncate hover:underline flex-1 min-w-0" 
                        title={arq.nome}
                      >
                        📄 {arq.nome}
                      </a>
                      <span className="text-gray-400 whitespace-nowrap text-[9px] shrink-0">
                        {new Date(arq.data).toLocaleDateString('pt-BR')}
                      </span>
                      <button
                        type="button"
                        onClick={() => excluirAnexo(arq)}
                        disabled={excluindoAnexo === chaveItem}
                        title="Excluir arquivo"
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded font-bold text-[9px] transition disabled:opacity-50 shrink-0"
                      >
                        {excluindoAnexo === chaveItem ? "..." : "🗑️"}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 italic text-center mt-4">Nenhum arquivo enviado.</p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}