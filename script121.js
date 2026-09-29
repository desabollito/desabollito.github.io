angular
    .module('webApp')
    .controller('modificarTurnoController', ['$scope', '$location', '$window', 'session', 'popupService', 'SITE', modificarTurnoController]);

function modificarTurnoController($scope, $location, $window, session, popupService, SITE) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Ingresá los datos de precarga  y de cod. de servicios  para acceder al calendario y solicitar un nuevo turno.');

    vm.sitekeyI = $scope.$parent.appCtrl.reCaptchaSiteKey;

    if (typeof (grecaptcha) === "undefined") {
        $location.path('/');
        return;
    }

    //CODIGO PARA ACCESO DIRECTO A LA URL
    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        iniciarModificarTurno($scope, session);
        vm.solicitud = session.get(0);
    }

    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            recaptchaCallback = function (token) {
                SITE.modificarTurno({ NumeroPrecarga: vm.numeroPrecarga, CodigoParaServicios: vm.codigoServicios, RecaptchaResponse: token },
                    function (data) {
                        grecaptcha.reset();
                        //TRAMITE
                        vm.solicitud.emailValido = true;
                        vm.solicitud.numeroPrecarga = data.NumeroPrecarga;
                        vm.solicitud.codigoParaServicios = vm.codigoServicios;

                        //SOLICITANTE
                        if (data.Solicitante) {
                            vm.solicitud.solicitante = new Solicitante();
                            vm.solicitud.solicitante.apellido = data.Solicitante.Apellido;
                            vm.solicitud.solicitante.nombre = data.Solicitante.Nombre;
                            //vm.solicitud.solicitante.idTipoCaracterSolicitante = data.Solicitante.IdTipoCaracterSolicitante;
                            vm.solicitud.solicitante.tipoDocumento = data.Solicitante.TipoDocumento;
                            vm.solicitud.solicitante.numeroDocumento = data.Solicitante.NumeroDocumento;
                            vm.solicitud.solicitante.email = data.Solicitante.Email;
                        }

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
                        vm.solicitud.requiereTitular = false;
                        vm.solicitud.codigoTramite = data.TipoTramite.CodigoTramite;
                        vm.solicitud.nombreTramite = data.TipoTramite.NombreTramite;

                        //TRANSFERENCIA
                        if (data.Transferencia) {
                            vm.solicitud.transferencia = new Transferencia();
                            //COMPRADORES
                            if (data.Transferencia.Compradores) {
                                vm.solicitud.transferencia.compradores = [];
                                angular.forEach(data.Transferencia.Compradores, function (value, key) {
                                    var comprador = new Solicitante();
                                    comprador.apellido = value.Apellido;
                                    comprador.nombre = value.Nombre;
                                    comprador.numeroDocumento = value.NumeroDocumento;
                                    comprador.email = value.Email;
                                    this.push(comprador);
                                }, vm.solicitud.transferencia.compradores);
                            }
                            //VENDEDORES
                            if (data.Transferencia.Vendedores) {
                                vm.solicitud.transferencia.vendedores = [];
                                angular.forEach(data.Transferencia.Vendedores, function (value, key) {
                                    var vendedor = new Solicitante();
                                    vendedor.apellido = value.Apellido;
                                    vendedor.nombre = value.Nombre;
                                    vendedor.numeroDocumento = value.NumeroDocumento;
                                    vendedor.email = value.Email;
                                    this.push(vendedor);
                                }, vm.solicitud.transferencia.vendedores);
                            }
                        }

                        //TURNOS
                        vm.solicitud.turnoToday = data.Turnos.hoy;
                        vm.solicitud.turnoStart = data.Turnos.inicio;
                        vm.solicitud.turnoEnd = data.Turnos.fin;
                        vm.solicitud.turnoDiasnolaborables = data.Turnos.diasNoLaborables;
                        vm.solicitud.dias = data.Turnos.dias;
                        $location.path('/seleccionarTurno');
                        return;
                    },
                    function () {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
        }
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}