$.extend($.fn.dataTable.defaults, {
    searching: false,
    processing: true,
    serverSide: true,
    dom: '<lp<tr>ip>',
    pagingType: 'full_numbers',
    language: {
        emptyTable: "No hay información disponible",
        loadingRecords: "Cargando...",
        processing: "Procesando...",
        lengthMenu: "Filas por página: _MENU_",
        zeroRecords: "Sin resultados",
        info: "Página _PAGE_ de _PAGES_",
        infoEmpty: "Sin resultados",
        paginate: {
            first: "Primera",
            last: "Última",
            next: "Siguiente",
            previous: "Previa"
        }
    }
});

$.fn.dataTable.ext.errMode = 'none';

var isIE = function () {
    return typeof navigator !== "undefined" &&
        (/MSIE /.test(navigator.userAgent) || (navigator.appName === 'Netscape' && /Trident\/.*rv:([0-9]{1,}[\.0-9]{0,})/.test(navigator.userAgent)));
}

var contains = function (string, fromArray) {
    return fromArray.some(function (v) {
        return string.indexOf(v) >= 0;
    });
}

function clone(obj) {
    //if (null == obj || "object" != typeof obj) return obj;
    //var copy = obj.constructor();
    //for (var attr in obj) {
    //    if (obj.hasOwnProperty(attr)) copy[attr] = obj[attr];
    //}
    //return copy;
    return JSON.parse(JSON.stringify(obj));
}

function registerInterceptorValidationSummary($scope, vm, $window) {
    $scope.$on('validationInterceptor-detected', function (event, modelState) {
        vm.formErrors = modelState[""];
        if ($window) $window.scrollTo(0, 0);
    });
}

function setTitulo($scope, titulo) {
    $scope.appCtrl.titulo = titulo;
}

function setSubtitulo($scope, subtitulo) {
    $scope.$parent.appCtrl.subtitulo = subtitulo;
}

function iniciarInformeWeb(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.InformeWeb;
    session.add(solicitud);
    setTitulo(scope, 'Obtener Informe Web');
}

function iniciarInformeWebAsociacionesProfesionales(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.AsociacionesProfesionales;
    //solicitud.vehiculo = 'A';//Iniciamos el vehiculo en A, para que en la vista selecionarTramite se muestre AYUDA
    session.add(solicitud);
    setTitulo(scope, 'Trámites para Asociaciones Profesionales');
}

function iniciarGestionarTurno(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.Turno;
    session.add(solicitud);
    setTitulo(scope, 'Iniciar Trámite Online');
}

function iniciarGestionarTurnoConsulta(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.Turno;
    session.add(solicitud);
    setTitulo(scope, 'Solicitar Turno para Consultas o Asesoramiento');
}

function iniciarGestionarTurnoRegistroFirmaDigital(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.Turno;
    session.add(solicitud);
    setTitulo(scope, 'Solicitar Turno para Registro de Firma Digital');
}

function iniciarGestionarTurnoRegistroReincidencia(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.Turno;
    session.add(solicitud);
    setTitulo(scope, 'Solicitar Turno para Certificado de Antecedentes Penales');
}

function iniciarRetirarDocumentacion(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.RetirarDocumentacion;
    session.add(solicitud);
    setTitulo(scope, 'Estado de Trámite');
}
function iniciarRetirarDocumentacionMandatario(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.RetirarDocumentacion;
    session.add(solicitud);
    setTitulo(scope, 'Estado de Trámite Mandatarios');
}
function iniciarModificarTurno(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.ModificarTurno;
    session.add(solicitud);
    setTitulo(scope, 'Modificar Turno');
}

function iniciarConsultaTramite(scope, session) {
    session.clear();
    var solicitud = new Solicitud();
    solicitud.operacion = OperacionEnum.ConsultaTramite;
    session.add(solicitud);
    setTitulo(scope, 'Consultar Trámite');
}