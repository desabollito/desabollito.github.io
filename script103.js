angular
    .module('webApp')
    .controller('seleccionarTramiteController', ['$scope', '$location', '$filter', '$window', '$routeParams', 'popupService', 'session', 'SITE', 'digitales', seleccionarTramiteController]);

function seleccionarTramiteController($scope, $location, $filter, $window, $routeParams, popupService, session, SITE, digitales) {
    $window.scrollTo(0, 0);
    var vm = this;
    setSubtitulo($scope, 'Elegí qué trámite querés iniciar.');

    vm.tipoTramiteExterno = function () {
        var codigoTipoTramite = $routeParams.tipoTramite;

        if (typeof (codigoTipoTramite) === "undefined") {
            return;
        }

        iniciarGestionarTurno($scope, session);
        //OBTENER TIPOS DE TRAMITE PARA TURNOS
        recaptchaCallback = function (token) {
            SITE.obtenerTiposTramitesParaTurnos(
                {
                    RecaptchaResponse: token,
                    EsMandatario: session.get(0).esMandatario || false
                },
                function (data) {
                    vm.solicitud = session.get(0);
                    vm.solicitud.esMandatario = session.get(0).esMandatario || false;
                    vm.solicitud.tiposTramites = data.TiposTramites;
                    var tipoTramite = $filter('filter')(vm.solicitud.tiposTramites, { CodigoTramite: codigoTipoTramite })[0];
                    vm.logicaSubmit(tipoTramite);
                },
                function () {
                });
        };
        grecaptcha.execute();
    };

    vm.tipoTramiteExterno();

    vm.solicitud = session.get(0);
    if (typeof (vm.solicitud) === "undefined") {
        $location.path('/');
        return;
    } else {
        vm.solicitud.codigoTramite = null;
        vm.solicitud.vehiculos = null;
        vm.solicitud.nombreTramite = null;

        if (vm.solicitud.operacion === OperacionEnum.Turno) {
            vm.tipoTramitePlaceholder = 'verde, cedula, cero kilometro, titulo, denuncia, prenda...';
        }

        if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
            //vm.tipoTramitePlaceholder = 'estado, historico, multas...';
            vm.tipoTramitePlaceholder = 'estado, historico ...';
        }
    }

    vm.codigoTramiteChanged = function ($item, $model) {
        if (vm.solicitud.operacion === OperacionEnum.Turno || vm.solicitud.operacion === OperacionEnum.AsociacionesProfesionales) {
            vm.noImplementado = !$item.Implementado;
            vm.vehiculos = $item.Vehiculos;
            vm.descripcion = $item.Descripcion || 'Tramite sin descripcion';
            vm.requisitos = $item.Requisitos;
            vm.tipoTramiteConceptoCertificaFirma = $item.TipoTramiteConceptoRequiereF13I;
            vm.tipoTramiteConceptoRequiereF13I = $item.TipoTramiteConceptoRequiereF13I;
        }
    };



    vm.submit = function () {
        vm.formErrors = [];
        $scope.$broadcast('show-errors-check-validity', 'form');
        if (vm.form.$valid) {
            var tipoTramite = $filter('filter')(vm.solicitud.tiposTramites, { CodigoTramite: vm.codigoTramite, Vehiculos: vm.vehiculos })[0];
            //vm.logicaSubmit(tipoTramite);
            vm.submitParaAgregarCOnfirmacion(tipoTramite);
        }
    };

    vm.logicaSubmit = function (tipoTramite) {
      
        //LINK A OTRO SISTEMA
        if (tipoTramite.LinkAOtroSistema) {
            document.location = tipoTramite.LinkAOtroSistema;
            return;
        }

        if (tipoTramite.CodigoTramite === '030999') {
            vm.solicitud.operacion = OperacionEnum.TramiteDigital;
        }

        //ASOCIASIONES PROFESIONALES
        if (vm.solicitud.operacion === OperacionEnum.AsociacionesProfesionales) {
            vm.solicitud.codigoTramite = tipoTramite.CodigoTramite;
            vm.solicitud.vehiculos = tipoTramite.Vehiculos ? tipoTramite.Vehiculos : vm.vehiculo;
            vm.solicitud.nombreTramite = tipoTramite.NombreTramite;
            vm.solicitud.requiereDominio = tipoTramite.RequiereDominio;
            vm.solicitud.excluyeDominio = tipoTramite.ExcluyeDominio;
            vm.solicitud.excluyeRegistro = tipoTramite.ExcluyeRegistro;
            vm.solicitud.implementado = tipoTramite.Implementado;
            vm.solicitud.conPresupuesto = tipoTramite.ConPresupuesto;
            vm.solicitud.precargaDesarrollada = tipoTramite.PrecargaDesarrollada;
            vm.solicitud.requiereTitular = tipoTramite.RequiereTitular;
            vm.solicitud.mandatarioCertificaFirma = vm.mandatarioCertificaFirma ? vm.mandatarioCertificaFirma : 0;
            vm.solicitud.mandatarioRequiereF13I = vm.mandatarioRequiereF13I ? vm.mandatarioRequiereF13I : 0;

            if (vm.solicitud.requiereDominio) {
                $location.path('/identificarDominio');
                return;
            }

            if (vm.solicitud.precargaDesarrollada) {
                vm.solicitud.codigoRegistroSeccional = 2001;
                vm.solicitud.registroDenominacion = 'DIR.NAC.R.N.P.A. Y CRED.PREN.';
                $location.path('/precarga');
                return;
            }

            alert('ERROR NO HAY PASO!!!');
            return;
        }

        //TURNO
        if (vm.solicitud.operacion === OperacionEnum.Turno) {
            vm.solicitud.codigoTramite = tipoTramite.CodigoTramite;
            vm.solicitud.vehiculos = tipoTramite.Vehiculos ? tipoTramite.Vehiculos : vm.vehiculo;
            vm.solicitud.nombreTramite = tipoTramite.NombreTramite;
            vm.solicitud.requiereDominio = tipoTramite.RequiereDominio;
            vm.solicitud.excluyeDominio = tipoTramite.ExcluyeDominio;
            vm.solicitud.excluyeRegistro = tipoTramite.ExcluyeRegistro;
            vm.solicitud.implementado = tipoTramite.Implementado;
            vm.solicitud.conPresupuesto = tipoTramite.ConPresupuesto;
            vm.solicitud.precargaDesarrollada = tipoTramite.PrecargaDesarrollada;
            vm.solicitud.requiereTitular = tipoTramite.RequiereTitular;
            vm.solicitud.mandatarioCertificaFirma = vm.mandatarioCertificaFirma ? vm.mandatarioCertificaFirma : 0;
            vm.solicitud.mandatarioRequiereF13I = vm.mandatarioRequiereF13I ? vm.mandatarioRequiereF13I : 0;

            if (vm.solicitud.excluyeDominio && vm.solicitud.excluyeRegistro) {
                $location.path('/solicitante');
                return;
            }

            if (vm.solicitud.requiereDominio) {
                $location.path('/identificarDominio');
            } else {
                if (vm.solicitud.excluyeDominio) {
                    $location.path('/seleccionarRegistro');
                } else {
                    $location.path('/identificarRegistro');
                }
            }
            return;
        }
        //TRAMITE DIGITAL
        if (vm.solicitud.operacion === OperacionEnum.TramiteDigital) {
            vm.solicitud.codigoTramite = tipoTramite.CodigoTramite;
            vm.solicitud.vehiculos = tipoTramite.Vehiculos ? tipoTramite.Vehiculos : vm.vehiculo;
            vm.solicitud.nombreTramite = tipoTramite.NombreTramite;
            vm.solicitud.requiereDominio = tipoTramite.RequiereDominio;
            vm.solicitud.excluyeDominio = tipoTramite.ExcluyeDominio;
            vm.solicitud.excluyeRegistro = tipoTramite.ExcluyeRegistro;
            vm.solicitud.implementado = tipoTramite.Implementado;
            vm.solicitud.conPresupuesto = tipoTramite.ConPresupuesto;
            vm.solicitud.precargaDesarrollada = tipoTramite.PrecargaDesarrollada;
            vm.solicitud.requiereTitular = tipoTramite.RequiereTitular;
            vm.solicitud.mandatarioCertificaFirma = vm.mandatarioCertificaFirma ? vm.mandatarioCertificaFirma : 0;
            vm.solicitud.mandatarioRequiereF13I = vm.mandatarioRequiereF13I ? vm.mandatarioRequiereF13I : 0;

            if (vm.solicitud.excluyeDominio && vm.solicitud.excluyeRegistro) {
                $location.path('/solicitante');
                return;
            }

            if (vm.solicitud.requiereDominio) {
                $location.path('/identificarDominio');
            } else {
                if (vm.solicitud.excluyeDominio) {
                    $location.path('/seleccionarRegistro');
                } else {
                    $location.path('/identificarRegistro');
                }
            }
            return;
        }
        //INFORME WEB
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {

            var tipoTramite = $filter('filter')(vm.solicitud.tiposTramites, { CodigoTramite: vm.codigoTramite })[0];

            vm.solicitud.codigoTramite = tipoTramite.CodigoTramite;
            vm.solicitud.nombreTramite = tipoTramite.NombreTramite;
            vm.solicitud.requiereDominio = tipoTramite.RequiereDominio;
            vm.solicitud.excluyeDominio = tipoTramite.ExcluyeDominio;
            vm.solicitud.excluyeRegistro = tipoTramite.ExcluyeRegistro;
            vm.solicitud.implementado = tipoTramite.Implementado;

            if (vm.informeCambiaRegistro === '1') {
                $location.path('/seleccionarRegistro');
                return;
            }

            // En este lugar debe validar si  vm.solicitud.codigoTramite ='022049' y  vm.solicitud.codigoRegistroSeccional=2993 y es vm.solicitud.registroLocalidad = "CABA"  =>  NO PASA!
            if (vm.solicitud.codigoTramite === "022049" &&
                vm.solicitud.codigoRegistroSeccional === 2993) {

                // Mostrar error al usuario (compatible con ng-bind-html en el template)
                vm.formErrors = ["El Registro Desarmadero no está disponible para el cobro del trámite: \"Informe de multas e infracciones de tránsito\". Por favor, seleccione otro registro."];
                // Limpiar todas las variables relacionadas
                vm.codigoRegistroSeccional = null;
                vm.registroCodigo = null;
                vm.registroDenominacion = null;
                vm.registroDireccion = null;
                vm.registroLocalidad = null;
                vm.registroTelefono = null;
                vm.registroHorario = null;

                // Scroll hacia arriba para que el usuario vea el error
                $window.scrollTo(0, 0);

                // Retornar para prevenir la ejecución del resto del código
                return false;
            }

            recaptchaCallback = function (token) {
                SITE.obtenerPresupuestoYMediosDePago(
                    {
                        RecaptchaResponse: token,
                        Operacion: vm.solicitud.operacion,
                        IdTipoCaracterSolicitante: vm.solicitud.solicitante.idTipoCaracterSolicitante,
                        Dominio: vm.solicitud.dominio,
                        CodigoRegistro: vm.solicitud.codigoRegistroSeccional,
                        CodigoTramite: vm.codigoTramite,
                        EsMandatario: vm.solicitud.esMandatario ? vm.solicitud.esMandatario : false,
                        MandatarioCertificaFirma: vm.solicitud.mandatarioCertificaFirma ? vm.solicitud.mandatarioCertificaFirma : 0,
                        MandatarioRequiereF13I: vm.solicitud.mandatarioRequiereF13I ? vm.solicitud.mandatarioRequiereF13I : 0
                    },
                    function (data) {
                        grecaptcha.reset();

                        vm.solicitud.bancos = data.Bancos;
                        vm.solicitud.redes = data.Redes;
                        vm.solicitud.presupuesto = data.Presupuesto;
                        vm.solicitud.registroVEPHabilitado = data.RegistroVEPHabilitado;
                        vm.solicitud.registroPagoMisCuentasHabilitado = data.RegistroPagoMisCuentasHabilitado;
                        vm.solicitud.registroTurnoPagoHabilitado = data.RegistroTurnoPagoHabilitado;
                        vm.solicitud.medioDePagoNombre = data.MedioDePagoNombre;
                        vm.solicitud.medioDePagoDescripcion = data.MedioDePagoDescripcion;
                        vm.solicitud.medioDePagoDescripcionDetallada = data.MedioDePagoDescripcionDetallada;

                        $location.path('/pago');
                        return;
                    },
                    function () {
                        grecaptcha.reset();
                    });
            };
            grecaptcha.execute();
            return;
        }
    }
    
    vm.submitParaAgregarCOnfirmacion = function (tipoTramite) {
        if (digitales.esUnTramiteConOpcionDigital(tipoTramite.CodigoTramite)) {
            //vm.confirmacionDeTramiteDigital("¿El tramite se originó Digitalmente (debe poseer una código CPD)?", tipoTramite.NombreTramite, tipoTramite);
            vm.logicaSubmit(tipoTramite);
        } else {
            vm.logicaSubmit(tipoTramite);
        }
    };

    vm.confirmacionDeTramiteDigital = function (text, titulo, tipoTramite) {
        popupService.showConfirmWithButtonName(text, titulo, 300, { aceptar: 'Si', cancelar: 'No' })
            .then(function () {
                var ctt = digitales.get(tipoTramite.CodigoTramite);
                
                SITE.obtenerTipoTramite({ codigoTramite: ctt.digital }, function (data) {
                    
                    vm.logicaSubmit(data.TiposTramites[0]);
                    
                    return;
                }, function (err) {
                    
                    alert(err);
                });
            }, function () {
                    
                vm.logicaSubmit(tipoTramite);
            });
    };

    vm.volver = function () {
        if (vm.solicitud.operacion === OperacionEnum.InformeWeb) {
            $location.path('/identificarDominio');
            return;
        }

        //SI NO HAY OPERACION VOY AL INICIO
        $location.path('/');
        return;
    };

    registerInterceptorValidationSummary($scope, vm, $window);
}