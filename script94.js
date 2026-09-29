/// <reference path="../../app.validation.js" />
angular
    .module('webApp')
    .controller('inicioController', ['$rootScope', '$scope', '$location', '$window', 'session', 'SITE', 'appConfig', inicioController]);

function inicioController($rootScope, $scope, $location, $window, session, SITE, appConfig) {
    $window.scrollTo(0, 0);

    var vm = this;

    vm.debugMode = appConfig.debugMode;
    
    setSubtitulo($scope, '');

    vm.mostrarRaviol = typeof($rootScope.claims) === "undefined" || $rootScope.claims === "" ? true : $rootScope.claims.CodigoRs === 0;
    if (vm.mostrarRaviol) {
        var url = $location.absUrl();
        if (url.indexOf('siterrss') >= 0) {
            $window.close();
        }
    }

    vm.iniciarTramite = function () {
        $("#myModal").modal({ backdrop: "static" });
    };

    vm.iniciarInformeWeb = function () {
        iniciarInformeWeb($scope, session);
        $location.path('/solicitante');
    };

    vm.iniciarInformeWebAsociacionesProfesionales = function () {
        iniciarInformeWebAsociacionesProfesionales($scope, session);
        $location.path('/solicitanteAsociado');
    };

    vm.gestionarTurno = function () {
        iniciarGestionarTurno($scope, session);
        //OBTENER TIPOS DE TRAMITE PARA TURNOS
        recaptchaCallback = function (token) {
            SITE.obtenerTiposTramitesParaTurnos(
                {
                    RecaptchaResponse: token,
                    EsMandatario: false
                },
                function (data) {
                    grecaptcha.reset();

                    vm.solicitud = session.get(0);
                    vm.solicitud.esMandatario = false;
                    vm.solicitud.tiposTramites = data.TiposTramites;

                    $location.path('/seleccionarTramite');
                    return;
                },
                function () {
                    grecaptcha.reset();
                });
        };
        grecaptcha.execute();
    };

    vm.gestionarTurnoConsulta = function () {
        iniciarGestionarTurnoConsulta($scope, session);

        vm.solicitud = session.get(0);

        vm.solicitud.esMandatario = false;
        vm.solicitud.codigoTramite = '999999';

        vm.solicitud.nombreTramite = 'CONSULTAS O ASESORAMIENTO EN REGISTRO SECCIONAL';
        vm.solicitud.requiereDominio = false;
        vm.solicitud.excluyeDominio = false;
        vm.solicitud.implementado = true;
        vm.solicitud.conPresupuesto = false;
        vm.solicitud.precargaDesarrollada = false;
        vm.solicitud.requiereTitular = false;

        $location.path('/identificarRegistro');
        return;
    };

    vm.gestionarTurnoRegistroFirmaDigital = function () {
        iniciarGestionarTurnoRegistroFirmaDigital($scope, session);

        vm.solicitud = session.get(0);

        vm.solicitud.esMandatario = false;
        vm.solicitud.codigoTramite = '999996';

        vm.solicitud.nombreTramite = 'REGISTRO DE FIRMA DIGITAL';
        vm.solicitud.requiereDominio = false;
        vm.solicitud.excluyeDominio = false;
        vm.solicitud.implementado = true;
        vm.solicitud.conPresupuesto = false;
        vm.solicitud.precargaDesarrollada = false;
        vm.solicitud.requiereTitular = false;

        $location.path('/seleccionarRegistroFirmaDigital');
        return;
    };
    
    vm.gestionarTurnoRegistroReincidencia = function () {
        iniciarGestionarTurnoRegistroReincidencia($scope, session);

        vm.solicitud = session.get(0);

        vm.solicitud.esMandatario = false;
        vm.solicitud.codigoTramite = '999995';

        vm.solicitud.nombreTramite = 'REGISTRO DE ANTECEDENTES PENALES';
        vm.solicitud.requiereDominio = false;
        vm.solicitud.excluyeDominio = false;
        vm.solicitud.implementado = true;
        vm.solicitud.conPresupuesto = false;
        vm.solicitud.precargaDesarrollada = false;
        vm.solicitud.requiereTitular = false;

        $location.path('/seleccionarRegistroReincidencia');
        return;
    };

    vm.transferenciaDigital = function () {
        $location.path('/08D');
    };

    vm.retirarDocumentacion = function () {
        iniciarRetirarDocumentacion($scope, session);
        $location.path('/identificarTramite');
    };

    vm.modificarTurno = function () {
        iniciarModificarTurno($scope, session);
        $location.path('/modificarTurno');
    };

    vm.consultaTramite = function () {
        iniciarConsultaTramite($scope, session);
        $location.path('/consultarTramite');
    };

}