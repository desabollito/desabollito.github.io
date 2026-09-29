angular.module('webApp')
    .config(['$routeProvider', ConfigRouteProvider]);

function ConfigRouteProvider($routeProvider) {
    var modules = 'app/modules/';
    $routeProvider.caseInsensitiveMatch = true;
    $routeProvider
        //SITE 2.0
        .when('/', {
            templateUrl: modules + 'inicio/inicio.html',
            controller: 'inicioController',
            controllerAs: 'inicioCtrl',
            titulo: 'Sistema Integral de Trámites Electrónicos',
            subtitulo: 'Elegí qué acción querés realizar.',
            access: {}
        })
        //ACCESOS DIRECTOS
        .when('/informesWeb', {
            templateUrl: modules + 'inicio/informesWeb.html',
            controller: 'informesWebController',
            controllerAs: 'informesWebCtrl',
            titulo: null,
            subtitulo: null,
            access: {}
        })
        .when('/retiroDeTramites', {
            templateUrl: modules + 'inicio/retiroDeTramites.html',
            controller: 'retiroDeTramitesController',
            controllerAs: 'retiroDeTramitesCtrl',
            titulo: null,
            subtitulo: null,
            access: {}
        })
        .when('/turnos', {
            templateUrl: modules + 'inicio/turnos.html',
            controller: 'turnosController',
            controllerAs: 'turnosCtrl',
            titulo: null,
            subtitulo: null,
            access: {}
        })
        .when('/mandatarios', {
            templateUrl: modules + 'mandatario/index.html',
            controller: 'indexController',
            controllerAs: 'indexCtrl',
            titulo: 'Portal de Mandatarios',
            subtitulo: null,
            access: {}
        })
        .when('/mandatarios/tablero', {
            templateUrl: modules + 'mandatario/tablero.html',
            controller: 'tableroController',
            controllerAs: 'tableroCtrl',
            titulo: 'Portal de Mandatarios',
            subtitulo: 'Seleccioná la operación que querés realizar.',
            access: {}
        })
        .when('/escribanias', {
            templateUrl: modules + 'escribania/index.html',
            controller: 'indexEsController',
            controllerAs: 'indexEsCtrl',
            titulo: 'Portal para Escribanos',
            subtitulo: null,
            access: {}
        })
        .when('/escribanias/tablero', {
            templateUrl: modules + 'escribania/tablero.html',
            controller: 'tableroEsController',
            controllerAs: 'tableroEsCtrl',
            titulo: 'Portal de Escribanos',
            subtitulo: 'Seleccioná la operación que querés realizar.',
            access: {}
        })
        //END:ACCESOS DIRECTOS
        .when('/solicitante', {
            templateUrl: modules + 'solicitudes/solicitante.html',
            controller: 'solicitanteController',
            controllerAs: 'solicitanteCtrl',
            titulo: null,
            subtitulo: null,
            access: {}
        })
        .when('/solicitanteAsociado/:solicitud?', {
            templateUrl: modules + 'solicitudes/solicitanteAsociado.html',
            controller: 'solicitanteAsociadoController',
            controllerAs: 'solicitanteAsociadoCtrl',
            titulo: null,
            subtitulo: null,
            access: {}
        })
        .when('/accion', {
            templateUrl: modules + 'solicitudes/accion.html',
            controller: 'accionController',
            controllerAs: 'accionCtrl',
            titulo: 'Acción',
            subtitulo: 'Selecciona que acción quieres realizar',
            access: {}
        })
        .when('/iniciarTramite', {
            templateUrl: modules + 'solicitudes/iniciarTramite.html',
            controller: 'iniciarTramiteController',
            controllerAs: 'iniciarTramiteCtrl',
            titulo: 'Iniciar Trámite',
            subtitulo: 'Selecciona el tipo de trámite que vas a realizar',
            access: {}
        })
        .when('/identificarRegistro', {
            templateUrl: modules + 'solicitudes/identificarRegistro.html',
            controller: 'identificarRegistroController',
            controllerAs: 'identificarRegistroCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/identificarDominio', {
            templateUrl: modules + 'solicitudes/identificarDominio.html',
            controller: 'identificarDominioController',
            controllerAs: 'identificarDominioCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/seleccionarRegistro', {
            templateUrl: modules + 'solicitudes/seleccionarRegistro.html',
            controller: 'seleccionarRegistroController',
            controllerAs: 'seleccionarRegistroCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/seleccionarRegistroFirmaDigital/:solicitud?', {
            templateUrl: modules + 'solicitudes/seleccionarRegistroFirmaDigital.html',
            controller: 'seleccionarRegistroFirmaDigitalController',
            controllerAs: 'seleccionarRegistroFirmaDigitalCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/seleccionarRegistroReincidencia/:solicitud?', {
            templateUrl: modules + 'solicitudes/seleccionarRegistroReincidencia.html',
            controller: 'seleccionarRegistroReincidenciaController',
            controllerAs: 'seleccionarRegistroReincidenciaCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/seleccionarTramite/:tipoTramite?', {
            templateUrl: modules + 'solicitudes/seleccionarTramite.html',
            controller: 'seleccionarTramiteController',
            controllerAs: 'seleccionarTramiteCtrl',
            titulo: null,
            //subtitulo: 'Trámite',
            access: {}
        })
        .when('/seleccionarRegistro08', {
            templateUrl: modules + 'vendedores/seleccionarRegistro08.html',
            controller: 'seleccionarRegistro08Controller',
            controllerAs: 'seleccionarRegistro08Ctrl',
            titulo: 'Seleccionar Registro',
            subtitulo: 'Seleccione el Registro en el cual desea realizar el trámite',
            access: {}
        })
        .when('/tramite', {
            templateUrl: modules + 'solicitudes/tramite.html',
            controller: 'tramiteController',
            controllerAs: 'tramiteCtrl',
            //titulo: 'Trámite',
            subtitulo: '',
            access: {}
        })
        .when('/retirarTramite', {
            templateUrl: modules + 'solicitudes/retirarTramite.html',
            controller: 'retirarTramiteController',
            controllerAs: 'retirarTramiteCtrl',
            titulo: 'Retiro de trámite iniciado',
            subtitulo: 'Complete los datos',
            access: {}
        })
        .when('/pago', {
            templateUrl: modules + 'solicitudes/pago.html',
            controller: 'pagoController',
            controllerAs: 'pagoCtrl',
            titulo: null,
            //subtitulo: 'Pago',
            access: {}
        })
        .when('/enviarEmail', {
            templateUrl: modules + 'solicitudes/enviarEmail.html',
            controller: 'enviarEmailController',
            controllerAs: 'enviarEmailCtrl',
            titulo: null,
            //subtitulo: 'Validar Email',
            access: {}
        })
        .when('/finalizar', {
            templateUrl: modules + 'solicitudes/finalizar.html',
            controller: 'finalizarController',
            controllerAs: 'finalizarCtrl',
            titulo: null,
            //subtitulo: 'Finalizar',
            access: {}
        })
        .when('/finalizarRs', {
            templateUrl: modules + 'solicitudes/finalizarRs.html',
            controller: 'finalizarRsController',
            controllerAs: 'finalizarRsCtrl',
            titulo: null,
            //subtitulo: 'Finalizar',
            access: {}
        })
        .when('/cancelarTurno', {
            templateUrl: modules + 'solicitudes/cancelarTurno.html',
            controller: 'cancelarTurnoController',
            controllerAs: 'cancelarTurnoCtrl',
            titulo: 'Cancelar Turno',
            //subtitulo: '',
            access: {}
        })
        .when('/modificarTurno', {
            templateUrl: modules + 'solicitudes/modificarTurno.html',
            controller: 'modificarTurnoController',
            controllerAs: 'modificarTurnoCtrl',
            titulo: null,
            //subtitulo: '',
            access: {}
        })
        .when('/identificarTramite/:solicitud?', {
            templateUrl: modules + 'solicitudes/identificarTramite.html',
            controller: 'identificarTramiteController',
            controllerAs: 'identificarTramiteCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/estadoTramite', {
            templateUrl: modules + 'solicitudes/estadoTramite.html',
            controller: 'estadoTramiteController',
            controllerAs: 'estadoTramiteCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/precarga', {
            templateUrl: modules + 'solicitudes/precarga.html',
            controller: 'precargaController',
            controllerAs: 'precargaCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/concesionario', {
            templateUrl: modules + 'solicitudes/concesionario.html',
            controller: 'concesionarioController',
            controllerAs: 'concesionarioCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/acreedorprendario', {
            templateUrl: modules + 'solicitudes/acreedorprendario.html',
            controller: 'acreedorPrendarioController',
            controllerAs: 'acreedorPrendarioCtrl',
            titulo: null,
            //subtitulo: 'Vehículo',
            access: {}
        })
        .when('/encuesta/:numeroPrecarga/:codigoParaServicios', {
            templateUrl: modules + 'encuestas/encuesta.html',
            controller: 'encuestaController',
            controllerAs: 'encuestaCtrl',
            titulo: 'Encuesta',
            subtitulo: 'Te invitamos a participar de esta encuesta de satisfacción para ayudarnos a mejorar el servicio.</br>Calificá cada una de las respuestas con una puntuación de 1 a 5, siendo 1 para la más baja y 5 para la más alta.',
            access: {}
        })
        //ESTIMADOR
        .when('/estimador', {
            templateUrl: modules + 'estimador/estimador.html',
            controller: 'estimadorController',
            controllerAs: 'estimadorCtrl',
            titulo: 'Estimador de costos',
            subtitulo: 'Calculá los costos aproximados para la <b>inscripción</b> de un vehículo 0 KM o la <b>transferencia</b> de un vehículo usado.',
            access: {}
        })
        .when('/estimador/presupuesto', {
            templateUrl: modules + 'estimador/presupuesto.html',
            controller: 'presupuestoController',
            controllerAs: 'presupuestoCtrl',
            titulo: 'Estimador de Costos',
            subtitulo: 'Calculá los costos aproximados para la <b>inscripción</b> de un vehículo 0 KM o la <b>transferencia</b> de un vehículo usado.',
            access: {}
        })
        .when('/asistencia', {
            templateUrl: modules + 'asistencia/asistencia.html',
            controller: 'asistenciaController',
            controllerAs: 'asistenciaCtrl',
            titulo: 'Ayuda',
            subtitulo: 'Asistencia al presentante.',
            access: {}
        })
        //SITE 2.1
        .when('/tramite/:codigoTramite/:vehiculo', {
            templateUrl: modules + 'tramitesOnline/tramiteOnline.html',
            controller: 'tramiteOnlineController',
            controllerAs: 'tramiteOnlineCtrl',
            titulo: 'Nuevo Trámite Online',
            subtitulo: '<strong>¡Ahorrá tiempo!</strong> Iniciá tu trámite online, conocé los requisitos y <strong>elegí</strong> el <i>día</i> y <i>horario</i> para ser atendido en el registro.',
            access: {}
        })
        //08D
        .when('/08D', {
            templateUrl: modules + 'home/home.html',
            controller: 'homeController',
            controllerAs: 'homeCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: '',
            access: {}
        })
        .when('/aclaraciones', {
            templateUrl: modules + 'home/requisitos.html',
            controller: 'aclaracionesController',
            controllerAs: 'aclaracionesCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Aclaraciones sobre el trámite',
            access: {}
        })
        .when('/certificado', {
            templateUrl: modules + 'vendedores/certificado.html',
            controller: 'certificadoController',
            controllerAs: 'certificadoCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Formulario 08 con firma/s certificada/s',
            access: {}
        })
        .when('/certificado04', {
            templateUrl: modules + 'vendedores/certificado04.html',
            controller: 'certificado04Controller',
            controllerAs: 'certificado04Ctrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Formulario 04 con firma/s certificada/s',
            access: {}
        })
        .when('/titulares', {
            templateUrl: modules + 'vendedores/titulares.html',
            controller: 'titularesController',
            controllerAs: 'titularesCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Listado de vendedores',
            access: {}
        })
        .when('/recuperar', {
            templateUrl: modules + 'recuperacion/recuperar.html',
            controller: 'recuperarController',
            controllerAs: 'recuperarCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Recuperar Precarga',
            access: {}
        })
        .when('/vendedores', {
            templateUrl: modules + 'vendedores/vendedores.html',
            controller: 'vendedoresController',
            controllerAs: 'vendedoresCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Datos del Auto/Moto',
            access: {}
        })
        .when('/vendedores/newph', {
            templateUrl: modules + 'vendedores/vendedorph.html',
            controller: 'vendedorphController',
            controllerAs: 'vendedorCtrl',
            titulo: 'Agregar Vendedor',
            subtitulo: 'Persona Física',
            subtitulo1: 'Representantes',
            mostrar: true,
            access: {}
        })
        .when('/vendedores/newpj', {
            templateUrl: modules + 'vendedores/vendedorpj.html',
            controller: 'vendedorpjController',
            controllerAs: 'vendedorCtrl',
            titulo: 'Agregar Vendedor',
            subtitulo: 'Persona Jurídica',
            subtitulo1: 'Representantes Legales',
            mostrar: false,
            access: {}
        })
        .when('/vendedores/newsh', {
            templateUrl: modules + 'vendedores/vendedorsh.html',
            controller: 'vendedorshController',
            controllerAs: 'vendedorCtrl',
            titulo: 'Agregar Vendedor',
            subtitulo: 'Sociedad de Hecho',
            subtitulo1: 'Socios/Representantes',
            mostrar: false,
            access: {}
        })
        .when('/vendedores/sh/new', {
            templateUrl: modules + 'vendedores/vendedorshsocio.html',
            controller: 'vendedorshController',
            controllerAs: 'vendedorCtrl',
            titulo: 'Sociedad de Hecho',
            subtitulo: 'Agregar Socio/Representante',
            access: {}
        })
        .when('/vendedores/gravamenes', {
            templateUrl: modules + 'vendedores/gravamenes.html',
            controller: 'gravamenesVendedoresController',
            controllerAs: 'gravamenesVendedoresCtrl',
            titulo: 'Prendas/Embargos',
            subtitulo: '',
            access: {}
        })
        .when('/vendedores/confirmar', {
            templateUrl: modules + 'vendedores/confirmacion.html',
            controller: 'titularesController',
            controllerAs: 'titularesCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Resumen Datos de Vendedores',
            access: {}
        })
        .when('/vendedores/final', {
            templateUrl: modules + 'vendedores/final.html',
            controller: 'finalVendedoresController',
            controllerAs: 'finalVendedoresCtrl',
            titulo: 'Carga de Vendedores Finalizada',
            access: {}
        })
        .when('/compradores', {
            templateUrl: modules + 'compradores/precarga.html',
            controller: 'compradoresController',
            controllerAs: 'compradoresCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Datos de la Transferencia',
            access: {}
        })
        .when('/compradores/dominio', {
            templateUrl: modules + 'compradores/dominio.html',
            controller: 'compradoresController',
            controllerAs: 'compradoresCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Datos del Vehículo',
            access: {}
        })
        .when('/compradores/continuar', {
            templateUrl: modules + 'compradores/comprador.html',
            controller: 'compradorController',
            controllerAs: 'compradorCtrl',
            titulo: 'Compradores',
            subtitulo: 'Continuar con precarga',
            access: {}
        })
        .when('/compradores/index', {
            templateUrl: modules + 'compradores/index.html',
            controller: 'compradoresController',
            controllerAs: 'compradoresCtrl',
            titulo: 'Compradores',
            subtitulo: 'Datos de compradores',
            access: {}
        })
        .when('/compradores/newph', {
            templateUrl: modules + 'compradores/compradorph.html',
            controller: 'compradorphController',
            controllerAs: 'compradorCtrl',
            titulo: 'Agregar Comprador',
            subtitulo: 'Persona Física',
            subtitulo1: 'Representantes',
            mostrar: true,
            access: {}
        })
        .when('/compradores/newpj', {
            templateUrl: modules + 'compradores/compradorpj.html',
            controller: 'compradorpjController',
            controllerAs: 'compradorCtrl',
            titulo: 'Agregar Comprador',
            subtitulo: 'Persona Jurídica',
            subtitulo1: 'Representantes Legales',
            mostrar: false,
            access: {}
        })
        .when('/compradores/newsh', {
            templateUrl: modules + 'compradores/compradorsh.html',
            controller: 'compradorshController',
            controllerAs: 'compradorCtrl',
            titulo: 'Agregar Comprador',
            subtitulo: 'Sociedad de Hecho',
            subtitulo1: 'Socios/Representantes',
            mostrar: false,
            access: {}
        })
        .when('/compradores/sh/new', {
            templateUrl: modules + 'compradores/compradorshsocio.html',
            controller: 'compradorController',
            controllerAs: 'compradorCtrl',
            titulo: 'Sociedad de Hecho',
            subtitulo: 'Agregar Socio/Representante',
            subtitulo1: 'Socios/Representantes',
            mostrar: false,
            access: {}
        })
        .when('/compradores/confirmar', {
            templateUrl: modules + 'compradores/confirmacion.html',
            controller: 'compradoresController',
            controllerAs: 'compradoresCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Finalizar Transferencia',
            access: {}
        })
        .when('/compradores/cedulas', {
            templateUrl: modules + 'compradores/cedulas.html',
            controller: 'compradoresController',
            controllerAs: 'compradoresCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Datos de Cédulas',
            access: {}
        })
        .when('/compradores/datoscompra', {
            templateUrl: modules + 'compradores/datoscompra.html',
            controller: 'compradoresController',
            controllerAs: 'compradoresCtrl',
            titulo: 'Transferencia Digital',
            subtitulo: 'Datos de la Operación',
            access: {}
        })
        .when('/compradores/gravamenes', {
            templateUrl: modules + 'compradores/gravamenes.html',
            controller: 'gravamenesCompradoresController',
            controllerAs: 'gravamenesCtrl',
            titulo: 'Prendas/Embargos',
            subtitulo: '',
            access: {}
        })
        .when('/compradores/final', {
            templateUrl: modules + 'compradores/final.html',
            controller: 'finalCompradoresController',
            controllerAs: 'finalCompradoresCtrl',
            titulo: 'Precarga Finalizada',
            subtitulo: '',
            access: {}
        })
        .when('/seleccionarTurno08D', {
            templateUrl: modules + 'turnos/turno.html',
            controller: 'turno08DController',
            controllerAs: 'turno08DCtrl',
            titulo: null,
            //subtitulo: 'Seleccionar',
            access: {}
        })
        .when('/seleccionarTurno', {
            templateUrl: modules + 'solicitudes/turno.html',
            controller: 'turnoController',
            controllerAs: 'turnoCtrl',
            titulo: null,
            //subtitulo: 'Seleccionar',
            access: {}
        })
        .when('/calculador/inicial', {
            templateUrl: modules + 'calculador/index.html',
            controller: 'calculadorController',
            controllerAs: 'calculadorCtrl',
            titulo: 'Calculador 0Km',
            subtitulo: '',
            access: {}
        })
        .when('/calculador/transferencia', {
            templateUrl: modules + 'calculador/index.html',
            controller: 'calculadorController',
            controllerAs: 'calculadorCtrl',
            titulo: 'Calculador Transferencia',
            subtitulo: '',
            access: {}
        })
        .when('/calculador/otros', {
            templateUrl: modules + 'calculador/index.html',
            controller: 'calculadorController',
            controllerAs: 'calculadorCtrl',
            titulo: 'Calculador Otros',
            subtitulo: '',
            access: {}
        })
        .when('/consultarTramite', {
            templateUrl: modules + 'consultaTramite/consultaTramite.html',
            controller: 'consultaTramiteController',
            controllerAs: 'ctCtrl',
            titulo: 'Descarga de documentación',
            subtitulo: 'Ingresá los datos de tu constancia.',
            access: {}
        })
        .when('/consultarTramite/:rs/:nt/:ncw/:t', {
            templateUrl: modules + 'consultaTramite/mostrarPdf.html',
            controller: 'mostrarPdfController',
            controllerAs: 'pdfCtrl',
            titulo: 'Descarga de documentación',
            subtitulo: 'Descargá y validá tus documentos.',
            access: {}
        })
        .when('/notauthorized', {
            templateUrl: 'notauthorized.html'
        })
        .otherwise({
            templateUrl: 'notfound.html'
        });

    //Usar HTML5 History API
    //$locationProvider.html5Mode(true);
}