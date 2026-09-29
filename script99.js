angular
    .module('webApp')
    .controller('solicitanteAsociadoController', ['$scope', '$location', '$window', 'session', '$http', 'Afip', 'appConfig', 'SITE', solicitanteAsociadoController]);

function solicitanteAsociadoController($scope, $location, $window, session, $http, Afip, appConfig, SITE) {
    $window.scrollTo(0, 0);

    var vm = this;

    var subtitulo = "<ul><li>Los trámites serán <b>abonados</b> por medios <b>electrónicos</b>, tomando como <b>pagador</b> a la <b>cámara</b> asociada al solicitante.</li>";
    subtitulo += "<li>Una vez <b>finalizado</b> y pagado el trámite, el mismo será <b>derivado</b> a la <b>cámara</b> asociada.</li>";
    subtitulo += "<li>Al finalizar esta <b>solicitud</b> recibirás un <b>correo electrónico</b> con el número de <b>precarga</b> correspondiente, para que gestiones el <b>resultado</b> ante la cámara correspondiente.</li></ul>";

    vm.iniciarInformeWebAsociacionesProfesionales = function () {
        if (typeof (solicitud) === "undefined" || solicitud !== "externo") {
            return;
        }

        iniciarInformeWebAsociacionesProfesionales($scope, session);
    };

    vm.iniciarInformeWebAsociacionesProfesionales();

    setSubtitulo($scope, subtitulo);

    vm.crearNuevoSolicitante = function () {
        vm.solicitud.solicitante = null;
        vm.solicitante = new Solicitante();
        vm.solicitante.tipoDocumento = '8';
        //vm.solicitante.numeroDocumento = 27280596642;
        vm.solicitante.idTipoCaracterSolicitante = '10';
    };

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.crearNuevoSolicitante();
    }

    vm.confirmar = function () {
        if (vm.solicitante.numeroDocumento !== '') {
            vm.formErrors = [];
            SITE.obtenerSolicitanteAsociado({
                cuit: vm.solicitante.numeroDocumento,
                operacion: vm.solicitud.codigoTramite === '999996' ? 2 : vm.solicitud.operacion},
                function (response) {
                    vm.esValido = true;
                    vm.solicitante.numeroDocumentoBuscado = vm.solicitante.numeroDocumento;
                    vm.solicitante.nombre = response.data.Nombre;
                    vm.solicitante.apellido = response.data.Apellido;
                    vm.solicitante.email = response.data.Email;
                    vm.solicitante.repitaEmail = response.data.Email;
                    vm.solicitante.celular = response.data.Celular;
                    vm.solicitante.asociacion = response.data.Asociacion;
                    vm.solicitante.asociacionCuit = response.data.AsociacionCuit;
                    vm.solicitante.buscado = true;
                },
                function (response) {
                    vm.esValido = true;

                    vm.formErrors = [];
                    if (response.data.ModelState && response.data.ModelState.asociado) {
                        //
                        vm.formErrors.push(response.data.ModelState.asociado[0]);
                        vm.esValido = false;
                        vm.solicitante.asociacion = null;
                        vm.solicitante.asociacionCuit = null;
                    }
                    else {
                        //
                        vm.formErrors.push(response.data.ModelState.solicitante[0]);
                        vm.solicitante.asociacion = response.data.ModelState.solicitanteAsociacionDenominacion[0];
                        vm.solicitante.asociacionCuit = response.data.ModelState.solicitanteAsociacionCuit[0];
                    }

                    vm.solicitante.numeroDocumentoBuscado = '';
                    vm.solicitante.nombre = '';
                    vm.solicitante.apellido = '';
                    vm.solicitante.email = '';
                    vm.solicitante.repitaEmail = '';
                    vm.solicitante.celular = '';
                    vm.solicitante.buscado = false;
                }
            );
        }
    };

    vm.modificarDatos = function () {
        vm.solicitante.numeroDocumentoBuscado = '';
        vm.solicitante.nombre = '';
        vm.solicitante.apellido = '';
        vm.solicitante.email = '';
        vm.solicitante.repitaEmail = '';
        vm.solicitante.celular = '';
        vm.solicitante.buscado = false;
        return;
    };

    vm.submit = function () {
        vm.formErrors = [];
        if (!vm.solicitante.buscado) vm.validarRepitaEmail();
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            if (vm.solicitante.buscado) {
                vm.solicitud.emailValido = true;
                vm.solicitante.numeroDocumento = vm.solicitante.numeroDocumentoBuscado;
            }
            vm.solicitud.solicitante = angular.copy(vm.solicitante);

            //POST TIPOS TRAMITE
            if (vm.solicitud.operacion === OperacionEnum.AsociacionesProfesionales) {
                recaptchaCallback = function (token) {
                    SITE.obtenerTiposTramitesParaAsociacionesProfesionales(
                        {
                            RecaptchaResponse: token
                        },
                        function (data) {
                            grecaptcha.reset();
                            session.get(0).tiposTramites = data.TiposTramites;
                            $location.path('/seleccionarTramite');
                            return;
                        },
                        function () {
                            grecaptcha.reset();
                            return;
                        });
                };
                grecaptcha.execute();
                return;
            }
            //END:POST TIPOS TRAMITE

            $location.path('/');
            return;
        }
    };

    vm.validarRepitaEmail = function () {
        vm.form.repitaEmail.$setValidity('repitaEmailInvalido', vm.solicitante.email && vm.solicitante.repitaEmail && vm.solicitante.email.toLowerCase() === vm.solicitante.repitaEmail.toLowerCase());
    };

    vm.repitaEmailChanged = function () {
        vm.validarRepitaEmail();
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}