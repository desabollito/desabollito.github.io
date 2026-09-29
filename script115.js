angular
    .module('webApp')
    .controller('identificarTramiteController', ['$scope', '$location', '$window', '$timeout', 'session', 'SITE', identificarTramiteController]);

function identificarTramiteController($scope, $location, $window, $timeout, session, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;

    if ($location.search().r && $location.search().w) {
        iniciarRetirarDocumentacion($scope, session);
    }

    vm.retirarDocumentacion = function () {
        if (typeof (solicitud) === "undefined" || solicitud !== "externo") {
            return;
        }

        iniciarRetirarDocumentacion($scope, session);
    };
    
    vm.retirarDocumentacion();

    setSubtitulo($scope, 'Para conocer el estado de tu trámite, es necesario que ingreses los datos impresos en el recibo.');

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        if ($location.search().r && $location.search().w) {
            vm.numeroRecibo = parseInt($location.search().r);
            vm.codigoVerificador = $location.search().w;
        }
        vm.solicitud.codigoTramite = null;
        vm.solicitud.nombreTramite = null;
        vm.solicitud.tramite = null;
        vm.solicitud.vehiculo = null;
        vm.solicitud.registro = null;


    }

    vm.volver = function () {
        $location.path('/');
        return;
    };

    vm.submit = function () {
        vm.formErrors = [];
   
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            if (vm.solicitud.operacion === OperacionEnum.RetirarDocumentacion) {
                recaptchaCallback = function (token) {
                    var sesionMandatario = null;
                    if (typeof (session.get(0)) !== "undefined") {
                        sesionMandatario = angular.copy(session.len() <= 1 ? session.get(0) : session.get(1));
                        //sesionMandatario.EsMandatario = session.len() === 1;
                    }
                   
                    SITE.identificarTramite(
                        {
                            NumeroRecibo: vm.numeroRecibo,
                            EsMandatario: sesionMandatario.esMandatario || false,
                            CodigoVerificador: vm.codigoVerificador,
                           
                            RecaptchaResponse: token
                        },
                        function (data) {
                            grecaptcha.reset();
                            
                            //PAGO
                            if (data.Monto) {
                                vm.solicitud.pago = new Pago();
                                vm.solicitud.pago.montoPresupuesto = data.Monto;
                            }

                            //ES MANDATARIO
                            vm.solicitud.esMandatario = sesionMandatario.EsMandatario || false;

                            //TRAMITE
                            vm.solicitud.tramite = new Tramite();
                            vm.solicitud.tramite.numeroTramite = data.Tramite.NumeroTramite;
                            vm.solicitud.tramite.numeroRecibo = vm.numeroRecibo;
                            vm.solicitud.tramite.codigoVerificador = vm.codigoVerificador;
                            vm.solicitud.tramite.estado = data.Tramite.Estado;
                            vm.solicitud.tramite.observacion = data.Tramite.Observacion;

                            //VEHICULO
                            vm.solicitud.clearVehiculo();
                            vm.solicitud.dominio = data.Vehiculo.Dominio;
                            vm.solicitud.codigoVehiculo = data.Vehiculo.CodigoVehiculo;

                            //REGISTRO
                            //vm.solicitud.registro = new Registro();
                            vm.solicitud.codigoRegistroSeccional = data.Registro.CodigoRegistroSeccional;
                            vm.solicitud.registroDenominacion = data.Registro.RegistroDenominacion;
                            vm.solicitud.registroDireccion = data.Registro.Direccion;
                            vm.solicitud.registroLocalidad = data.Registro.Localidad;

                            //TIPO TRAMITE
                            vm.solicitud.clearTipoTramite();
                            vm.solicitud.requiereTitular = true;
                            vm.solicitud.codigoTramite = data.TipoTramite.CodigoTramite;
                            vm.solicitud.nombreTramite = data.TipoTramite.NombreTramite;
                            

                            //TURNOS
                            vm.solicitud.turnoToday = data.Turnos.hoy;
                            vm.solicitud.turnoStart = data.Turnos.inicio;
                            vm.solicitud.turnoEnd = data.Turnos.fin;
                            vm.solicitud.turnoDiasnolaborables = data.Turnos.diasNoLaborables;
                            vm.solicitud.dias = data.Turnos.dias;
                            $location.path('/estadoTramite');
                            return;
                        },
                        function () {
                            grecaptcha.reset();
                        });
                };
                grecaptcha.execute();
                return;
            }

            $location.path('/');
            return;
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}